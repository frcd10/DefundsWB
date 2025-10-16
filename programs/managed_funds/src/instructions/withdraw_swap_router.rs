use anchor_lang::prelude::*;
use anchor_lang::solana_program::{instruction::Instruction, program::invoke_signed};
use anchor_spl::token::{Token, TokenAccount};
use crate::state::*;
use crate::errors::*;
use std::str::FromStr;

pub const JUPITER_PROGRAM_ID: &str = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";

#[derive(Accounts)]
pub struct WithdrawSwapRouter<'info> {
    #[account(
        mut,
        seeds = [b"withdrawal", fund.key().as_ref(), investor.key().as_ref()],
        bump = withdrawal_state.bump,
        has_one = investor,
        constraint = withdrawal_state.vault == fund.key()
    )]
    pub withdrawal_state: Account<'info, WithdrawalState>,

    #[account(
        mut,
        seeds = [b"fund", fund.manager.as_ref(), fund.name.as_bytes()],
        bump = fund.bump
    )]
    pub fund: Account<'info, Fund>,

    #[account(mut)]
    pub investor: Signer<'info>,

    /// CHECK: Jupiter router program id; validated at runtime
    pub jupiter_program: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,

    #[account(mut)]
    pub fund_source_token_account: Account<'info, TokenAccount>,

    /// CHECK: token mint for input; used for PDA derivation of progress
    pub input_mint: UncheckedAccount<'info>,

    /// CHECK: progress PDA seeded by ("withdrawal_mint", withdrawal_state, input_mint)
    #[account(
        init_if_needed,
        payer = investor,
        space = WithdrawalMintProgress::SPACE,
        seeds = [b"withdrawal_mint", withdrawal_state.key().as_ref(), input_mint.key().as_ref()],
        bump
    )]
    pub progress: Account<'info, WithdrawalMintProgress>,
}

pub fn withdraw_swap_router<'info>(
    ctx: Context<'_, '_, 'info, 'info, WithdrawSwapRouter<'info>>,
    in_amount: u64,
    min_out_amount: u64,
    router_data: Vec<u8>,
    is_ledger: bool,
) -> Result<()> {
    // Status must be Initiated or Liquidating
    let ws = &mut ctx.accounts.withdrawal_state;
    require!(
        ws.status == WithdrawalStatus::Initiated || ws.status == WithdrawalStatus::Liquidating,
        FundError::InvalidWithdrawalStatus
    );

    // Validate Jupiter program id
    let expected = Pubkey::from_str(JUPITER_PROGRAM_ID).map_err(|_| error!(anchor_lang::error::ErrorCode::ConstraintSeeds))?;
    require_keys_eq!(ctx.accounts.jupiter_program.key(), expected);

    // Enforce proportional cap for this mint
    let fund_ata = &ctx.accounts.fund_source_token_account;
    require_keys_eq!(fund_ata.owner, ctx.accounts.fund.key());
    require_keys_eq!(fund_ata.mint, ctx.accounts.input_mint.key());

    let fraction = ws.fraction_bps as u128; // 1e6 precision
    require!(fraction > 0, FundError::InvalidInput);

    let balance = fund_ata.amount as u128;
    let allowed_total = (balance * fraction) / 1_000_000u128;

    let progress = &mut ctx.accounts.progress;
    if progress.amount_liquidated == 0 {
        progress.withdrawal = ws.key();
        progress.mint = ctx.accounts.input_mint.key();
        progress.amount_liquidated = 0;
        progress.bump = ctx.bumps.progress;
    } else {
        require_keys_eq!(progress.withdrawal, ws.key());
        require_keys_eq!(progress.mint, ctx.accounts.input_mint.key());
    }

    let remaining_allowance = allowed_total.saturating_sub(progress.amount_liquidated as u128) as u64;
    require!(in_amount > 0 && in_amount <= remaining_allowance, FundError::InvalidAmount);

    // Forward Jupiter CPI (ledger or route) using remaining_accounts in the exact order Jupiter returned.
    let infos: Vec<AccountInfo> = ctx.remaining_accounts.iter().map(|acc| acc.to_account_info()).collect();
    let metas: Vec<anchor_lang::solana_program::instruction::AccountMeta> = ctx
        .remaining_accounts
        .iter()
        .map(|acc| anchor_lang::solana_program::instruction::AccountMeta {
            pubkey: *acc.key,
            is_signer: acc.is_signer,
            is_writable: acc.is_writable,
        })
        .collect();

    // Build inner instruction
    let ix = Instruction {
        program_id: ctx.accounts.jupiter_program.key(),
        accounts: metas,
        data: router_data,
    };

    // Fund PDA signer seeds
    let f = &ctx.accounts.fund;
    let signer_seeds: &[&[&[u8]]] = &[&[b"fund", f.manager.as_ref(), f.name.as_bytes(), &[f.bump]]];

    invoke_signed(&ix, &infos, signer_seeds).map_err(|_| error!(FundError::InvocationFailed))?;

    // Only update progress after the route (not during ledger pre-withdraw)
    if !is_ledger {
        progress.amount_liquidated = progress.amount_liquidated.saturating_add(in_amount);
        ws.status = WithdrawalStatus::Liquidating;
    }

    Ok(())
}
