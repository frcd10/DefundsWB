use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Burn};
use crate::state::*;
use crate::errors::*;

#[derive(Accounts)]
pub struct FinalizeWithdrawal<'info> {
    #[account(
        mut,
        seeds = [b"fund", fund.manager.as_ref(), fund.name.as_bytes()],
        bump = fund.bump
    )]
    pub fund: Account<'info, Fund>,

    #[account(
        mut,
        seeds = [b"position", investor.key().as_ref(), fund.key().as_ref()],
        bump,
        has_one = investor,
        has_one = fund
    )]
    pub investor_position: Account<'info, InvestorPosition>,

    #[account(
        mut,
        seeds = [b"shares", fund.key().as_ref()],
        bump = fund.shares_bump,
        mint::authority = fund
    )]
    pub shares_mint: Account<'info, anchor_spl::token::Mint>,

    #[account(
        mut,
        token::mint = shares_mint,
        token::authority = investor
    )]
    pub investor_shares_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"withdrawal", fund.key().as_ref(), investor.key().as_ref()],
        bump = withdrawal_state.bump,
        has_one = investor,
        constraint = withdrawal_state.vault == fund.key(),
        constraint = withdrawal_state.status == WithdrawalStatus::ReadyToFinalize || withdrawal_state.status == WithdrawalStatus::Initiated
    )]
    pub withdrawal_state: Account<'info, WithdrawalState>,

    #[account(
        mut,
        seeds = [b"vault_sol", fund.key().as_ref()],
        bump
    )]
    /// CHECK: This is the vault's SOL account, a PDA that holds SOL
    pub vault_sol_account: AccountInfo<'info>,

    #[account(mut)]
    pub investor: Signer<'info>,

    /// CHECK: This is the trader's wallet address from the fund
    pub trader: AccountInfo<'info>,

    /// CHECK: This is the treasury wallet address
    pub treasury: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn finalize_withdrawal(ctx: Context<FinalizeWithdrawal>) -> Result<()> {
    let fund = &mut ctx.accounts.fund;
    let investor_position = &mut ctx.accounts.investor_position;
    let withdrawal_state = &mut ctx.accounts.withdrawal_state;
    let clock = Clock::get()?;

    let shares_to_burn = withdrawal_state.shares_to_withdraw;

    // Calculate withdrawal amount based on current fund valuation
    let base_withdrawal_amount = if withdrawal_state.sol_accumulated > 0 {
        // Use accumulated SOL from liquidations
        withdrawal_state.sol_accumulated
    } else {
        // Calculate from vault SOL balance (for SOL-only funds)
        let vault_balance = ctx.accounts.vault_sol_account.lamports();
        let share_percentage = shares_to_burn as f64 / investor_position.shares as f64;
        (vault_balance as f64 * share_percentage) as u64
    };

    // Calculate fees
    let initial_investment = (investor_position.total_deposited as f64 * shares_to_burn as f64 / investor_position.shares as f64) as u64;
    let profit = if base_withdrawal_amount > initial_investment {
        base_withdrawal_amount - initial_investment
    } else {
        0
    };

    // Fee calculations (default values)
    let performance_fee_bps = fund.performance_fee; // from fund settings
    let platform_fee_bps = 100u16; // 1% platform fee

    // Performance fee (20% of profit by default)
    let performance_fee = if profit > 0 {
        (profit as u128 * performance_fee_bps as u128 / 10000) as u64
    } else {
        0
    };

    // Platform gets 20% of performance fee
    let platform_performance_fee = performance_fee * 20 / 100;
    let trader_performance_fee = performance_fee - platform_performance_fee;

    // Platform withdrawal fee (1% of total withdrawal)
    let platform_withdrawal_fee = (base_withdrawal_amount as u128 * platform_fee_bps as u128 / 10000) as u64;

    // Total fees
    let total_platform_fees = platform_performance_fee + platform_withdrawal_fee;
    let final_withdrawal_amount = base_withdrawal_amount - performance_fee - platform_withdrawal_fee;

    // Verify vault has enough SOL
    let vault_balance = ctx.accounts.vault_sol_account.lamports();
    require!(
        vault_balance >= base_withdrawal_amount,
        FundError::InsufficientFunds
    );

    // Burn shares from investor
    let burn_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Burn {
            mint: ctx.accounts.shares_mint.to_account_info(),
            from: ctx.accounts.investor_shares_account.to_account_info(),
            authority: ctx.accounts.investor.to_account_info(),
        },
    );
    token::burn(burn_ctx, shares_to_burn)?;

    // Transfer SOL to investor
    let vault_sol_account = &ctx.accounts.vault_sol_account;
    let investor_account = &ctx.accounts.investor;

    **vault_sol_account.try_borrow_mut_lamports()? -= final_withdrawal_amount;
    **investor_account.to_account_info().try_borrow_mut_lamports()? += final_withdrawal_amount;

    // Transfer fees to trader (performance fee only)
    if trader_performance_fee > 0 {
        **vault_sol_account.try_borrow_mut_lamports()? -= trader_performance_fee;
        **ctx.accounts.trader.try_borrow_mut_lamports()? += trader_performance_fee;
    }

    // Transfer fees to treasury
    if total_platform_fees > 0 {
        **vault_sol_account.try_borrow_mut_lamports()? -= total_platform_fees;
        **ctx.accounts.treasury.try_borrow_mut_lamports()? += total_platform_fees;
    }

    // Update fund state
    fund.total_shares = fund.total_shares.checked_sub(shares_to_burn).ok_or(FundError::MathOverflow)?;
    fund.total_assets = fund.total_assets.checked_sub(base_withdrawal_amount).ok_or(FundError::MathOverflow)?;

    // Update investor position
    investor_position.shares = investor_position.shares.checked_sub(shares_to_burn).ok_or(FundError::MathOverflow)?;
    investor_position.total_withdrawn = investor_position.total_withdrawn.checked_add(final_withdrawal_amount).ok_or(FundError::MathOverflow)?;
    investor_position.last_activity_at = clock.unix_timestamp;

    // Update withdrawal state
    withdrawal_state.status = WithdrawalStatus::Completed;

    Ok(())
}
