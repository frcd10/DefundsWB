use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::*;

#[derive(Accounts)]
pub struct InitiateWithdrawal<'info> {
    #[account(
        mut,
        seeds = [b"fund", fund.manager.as_ref(), fund.name.as_bytes()],
        bump = fund.bump
    )]
    pub fund: Account<'info, Fund>,

    #[account(
        seeds = [b"position", investor.key().as_ref(), fund.key().as_ref()],
        bump,
        has_one = investor,
        has_one = fund
    )]
    pub investor_position: Account<'info, InvestorPosition>,

    #[account(
        init,
        payer = investor,
        space = WithdrawalState::SPACE,
        seeds = [b"withdrawal", fund.key().as_ref(), investor.key().as_ref()],
        bump
    )]
    pub withdrawal_state: Account<'info, WithdrawalState>,

    #[account(mut)]
    pub investor: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn initiate_withdrawal(
    ctx: Context<InitiateWithdrawal>,
    shares_to_withdraw: u64,
) -> Result<()> {
    require!(shares_to_withdraw > 0, FundError::InvalidShares);

    let fund = &ctx.accounts.fund;
    let investor_position = &ctx.accounts.investor_position;
    let withdrawal_state = &mut ctx.accounts.withdrawal_state;
    let clock = Clock::get()?;

    // Verify investor has enough shares
    require!(
        investor_position.shares >= shares_to_withdraw,
        FundError::InsufficientFunds
    );

    // For now, simulate getting vault positions
    // In a real implementation, this would fetch from vault positions
    let total_positions = 0u8; // Will be updated when position tracking is implemented

    **withdrawal_state = WithdrawalState {
        investor: ctx.accounts.investor.key(),
        vault: fund.key(),
        shares_to_withdraw,
        positions_liquidated: 0,
        total_positions,
        sol_accumulated: 0,
        status: WithdrawalStatus::Initiated,
        created_at: clock.unix_timestamp,
        bump: ctx.bumps.withdrawal_state,
    };

    msg!(
        "Initiated withdrawal for investor {} from fund {}, shares: {}",
        ctx.accounts.investor.key(),
        fund.key(),
        shares_to_withdraw
    );

    Ok(())
}
