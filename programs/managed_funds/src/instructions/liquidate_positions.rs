use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::*;
use anchor_spl::token::{self, Token, TokenAccount, CloseAccount};
use std::str::FromStr;

#[derive(Accounts)]
pub struct LiquidatePositionsBatch<'info> {
    #[account(
        mut,
        seeds = [b"withdrawal", fund.key().as_ref(), investor.key().as_ref()],
        bump = withdrawal_state.bump,
        has_one = investor,
        constraint = withdrawal_state.vault == fund.key()
    )]
    pub withdrawal_state: Account<'info, WithdrawalState>,

    #[account(
        seeds = [b"fund", fund.manager.as_ref(), fund.name.as_bytes()],
        bump = fund.bump
    )]
    pub fund: Account<'info, Fund>,

    #[account(mut)]
    pub investor: Signer<'info>,

    /// CHECK: WSOL mint passed by client; validated by comparing to known address
    pub wsol_mint: UncheckedAccount<'info>,

    #[account(mut)]
    pub fund_wsol_ata: Account<'info, TokenAccount>,

    #[account(mut)]
    pub fund_sol_destination: SystemAccount<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn liquidate_positions_batch(
    ctx: Context<LiquidatePositionsBatch>,
    unwrap_wsol: bool,
    min_lamports: u64,
) -> Result<()> {
    let withdrawal_state = &mut ctx.accounts.withdrawal_state;

    require!(
        withdrawal_state.status == WithdrawalStatus::Initiated || 
        withdrawal_state.status == WithdrawalStatus::Liquidating,
        FundError::InvalidWithdrawalStatus
    );

    // Update status to liquidating
    withdrawal_state.status = WithdrawalStatus::Liquidating;

    // Option A: Only WSOL/SOL path. Compute investor fraction and unwrap that portion to SOL.
    // fraction_bps in 1e6 precision
    let fraction_bps = withdrawal_state.fraction_bps as u128;
    require!(fraction_bps > 0, FundError::InvalidInput);

    // Validate WSOL mint matches known address
    let wsol_expected = Pubkey::from_str("So11111111111111111111111111111111111111112").unwrap();
    require_keys_eq!(ctx.accounts.wsol_mint.key(), wsol_expected);

    // Ensure the fund_wsol_ata is WSOL and owned by the fund PDA
    require_keys_eq!(ctx.accounts.fund_wsol_ata.mint, ctx.accounts.wsol_mint.key());
    require_keys_eq!(ctx.accounts.fund_wsol_ata.owner, ctx.accounts.fund.key());

    // Compute portion to unwrap
    let current_wsol = ctx.accounts.fund_wsol_ata.amount as u128;
    let portion = (current_wsol * fraction_bps) / 1_000_000u128;
    let portion_u64 = portion as u64;
    require!(portion_u64 >= min_lamports, FundError::InsufficientFunds);

    if unwrap_wsol && portion_u64 > 0 {
        // Close a temporary ATA with `portion_u64` would require a split; for simplicity, unwrap by closing if entirety, else error.
        // Realistic approach: perform a token::transfer to a dedicated temp ATA and then close it to SOL destination.
        // Here we enforce that portion equals the full balance to allow close. Otherwise, return InvalidAmount.
        require!(portion_u64 == ctx.accounts.fund_wsol_ata.amount, FundError::InvalidAmount);

        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            CloseAccount {
                account: ctx.accounts.fund_wsol_ata.to_account_info(),
                destination: ctx.accounts.fund_sol_destination.to_account_info(),
                authority: ctx.accounts.fund.to_account_info(),
            },
        );

        // Signer seeds for the fund PDA
        let f = &ctx.accounts.fund;
        let signer_seeds: &[&[&[u8]]] = &[&[b"fund", f.manager.as_ref(), f.name.as_bytes(), &[f.bump]]];
        token::close_account(cpi_ctx.with_signer(signer_seeds))?;

        withdrawal_state.sol_accumulated = withdrawal_state.sol_accumulated.saturating_add(portion_u64);
        withdrawal_state.positions_liquidated = withdrawal_state.total_positions; // Only WSOL path
        withdrawal_state.status = WithdrawalStatus::ReadyToFinalize;
    }

    Ok(())
}
