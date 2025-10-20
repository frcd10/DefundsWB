use anchor_lang::prelude::*;
use anchor_lang::solana_program::{instruction::Instruction, program::invoke_signed};
use anchor_spl::token::Token;
use crate::state::*;
use std::str::FromStr;

// Jupiter Aggregator v6 program id
pub const JUPITER_PROGRAM_ID: &str = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";

#[derive(Accounts)]
pub struct WithdrawSwapInstruction<'info> {
    #[account(
        mut,
        seeds = [b"fund", fund.manager.as_ref(), fund.name.as_bytes()],
        bump = fund.bump
    )]
    pub fund: Account<'info, Fund>,

    #[account(
        mut,
        seeds = [b"withdrawal", fund.key().as_ref(), investor.key().as_ref()],
        bump = withdrawal_state.bump,
        has_one = investor,
        constraint = withdrawal_state.vault == fund.key(),
        constraint = withdrawal_state.status == WithdrawalStatus::Initiated || withdrawal_state.status == WithdrawalStatus::ReadyToFinalize
    )]
    pub withdrawal_state: Account<'info, WithdrawalState>,

    /// CHECK: Jupiter router program id; validated at runtime
    pub jupiter_program: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,

    // Payer of compute/fees, and the owner of the withdrawal
    #[account(mut)]
    pub investor: Signer<'info>,
}

// Forward a single Jupiter router instruction for investor-initiated withdrawal.
// - Expects remaining_accounts to contain the exact account metas required by Jupiter,
//   including the Fund PDA as the `user` account. We will mark the Fund PDA as signer.
// - Updates WithdrawalState.input_allowed_total_sum and input_liquidated_sum to enable k-scaling in finalize.
pub fn withdraw_swap_instruction<'info>(
    ctx: Context<'_, '_, 'info, 'info, WithdrawSwapInstruction<'info>>,
    router_data: Vec<u8>,
    in_amount: u64,
    out_min_amount: u64,
) -> Result<()> {
    // Validate Jupiter program id
    let expected = Pubkey::from_str(JUPITER_PROGRAM_ID)
        .map_err(|_| error!(anchor_lang::error::ErrorCode::ConstraintSeeds))?;
    require_keys_eq!(ctx.accounts.jupiter_program.key(), expected);

    // Verify investor is the owner of this withdrawal
    require_keys_eq!(ctx.accounts.investor.key(), ctx.accounts.withdrawal_state.investor);

    // Update allowed sum on first call (idempotent pattern: only add if allowed is 0)
    let ws = &mut ctx.accounts.withdrawal_state;
    if ws.input_allowed_total_sum == 0 {
        ws.input_allowed_total_sum = in_amount;
    } else {
        // Allow multiple legs to accumulate allowed total
        ws.input_allowed_total_sum = ws
            .input_allowed_total_sum
            .saturating_add(in_amount);
    }

    // Prepare CPI to Jupiter, marking Fund PDA as signer within remaining_accounts
    let user_key = ctx.accounts.fund.key();
    let mut metas: Vec<anchor_lang::solana_program::instruction::AccountMeta> = ctx
        .remaining_accounts
        .iter()
        .map(|acc| anchor_lang::solana_program::instruction::AccountMeta {
            pubkey: *acc.key,
            is_signer: if acc.key == &user_key { true } else { acc.is_signer },
            is_writable: acc.is_writable,
        })
        .collect();

    let infos: Vec<AccountInfo> = ctx
        .remaining_accounts
        .iter()
        .map(|acc| acc.to_account_info())
        .collect();

    // Fund PDA signer seeds
    let f = &ctx.accounts.fund;
    let seeds: &[&[u8]] = &[b"fund", f.manager.as_ref(), f.name.as_bytes(), &[f.bump]];
    let signer_seeds: &[&[&[u8]]] = &[seeds];

    // CPI into Jupiter router
    let ix = Instruction { program_id: ctx.accounts.jupiter_program.key(), accounts: metas.drain(..).collect(), data: router_data };
    invoke_signed(&ix, &infos, signer_seeds)
        .map_err(|_| error!(anchor_lang::error::ErrorCode::ConstraintRaw))?;

    // On success, conservatively account for progress:
    // - Add input in_amount to liquidated input sum
    // - Add a lower bound on SOL received using out_min_amount (based on quote threshold)
    ws.input_liquidated_sum = ws.input_liquidated_sum.saturating_add(in_amount);
    ws.sol_accumulated = ws.sol_accumulated.saturating_add(out_min_amount);

    // If any WSOL is accumulated externally and tracked, callers can separately bump ws.sol_accumulated via a dedicated instruction.
    // For now we keep status as Initiated until the client marks ReadyToFinalize when done swapping.

    Ok(())
}
