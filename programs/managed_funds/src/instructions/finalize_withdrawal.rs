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
        constraint = withdrawal_state.status == WithdrawalStatus::ReadyToFinalize || withdrawal_state.status == WithdrawalStatus::Initiated,
        close = investor
    )]
    pub withdrawal_state: Account<'info, WithdrawalState>,

    // We will pay SOL directly from the fund PDA lamports

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
    let clock = Clock::get()?;

    // Read-only snapshots to avoid borrow conflicts
    let ws = &ctx.accounts.withdrawal_state;
    let ip = &ctx.accounts.investor_position;
    let fund_ro = &ctx.accounts.fund;
    let manager_key = fund_ro.manager;
    let fund_name = fund_ro.name.clone();
    let fund_bump = fund_ro.bump;
    let performance_fee_bps = fund_ro.performance_fee;

    // Completion factor k in [0,1] based on actually liquidated input vs allowed input
    let allowed_sum = ws.input_allowed_total_sum as u128;
    let done_sum = ws.input_liquidated_sum as u128;
    let (k_num, k_den) = if allowed_sum > 0 { (done_sum.min(allowed_sum), allowed_sum) } else { (0, 1) };

    // Effective shares to burn: floor(shares_to_withdraw * k)
    let shares_to_burn_eff = ((ws.shares_to_withdraw as u128).saturating_mul(k_num) / k_den) as u64;

    // Effective fraction (1e6 precision)
    let fraction_bps_eff = ((ws.fraction_bps as u128).saturating_mul(k_num) / k_den) as u64;

    // Base withdrawal amount: prefer actual accumulated SOL over theoretical vault fraction
    let base_withdrawal_amount = if ws.sol_accumulated > 0 {
        ws.sol_accumulated
    } else if allowed_sum > 0 {
        let vault_balance = fund_ro.to_account_info().lamports() as u128;
        let portion = vault_balance.saturating_mul(fraction_bps_eff as u128) / 1_000_000u128;
        portion as u64
    } else {
        0
    };

    // Calculate fees
    let initial_investment = (ip.total_deposited as f64 * shares_to_burn_eff as f64 / ip.shares as f64) as u64;
    let profit = if base_withdrawal_amount > initial_investment {
        base_withdrawal_amount - initial_investment
    } else {
        0
    };

    // Fee calculations (default values)
    // performance_fee_bps taken from fund_ro above
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
    let vault_balance = fund_ro.to_account_info().lamports();
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
    token::burn(burn_ctx, shares_to_burn_eff)?;

    // Transfer SOL to investor (program-owned source): adjust lamports directly
    let vault_sol_account = &fund_ro.to_account_info();
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
    let fund = &mut ctx.accounts.fund;
    fund.total_shares = fund.total_shares.checked_sub(shares_to_burn_eff).ok_or(FundError::MathOverflow)?;
    fund.total_assets = fund.total_assets.checked_sub(base_withdrawal_amount).ok_or(FundError::MathOverflow)?;

    // Update investor position
    let investor_position = &mut ctx.accounts.investor_position;
    investor_position.shares = investor_position.shares.checked_sub(shares_to_burn_eff).ok_or(FundError::MathOverflow)?;
    investor_position.total_withdrawn = investor_position.total_withdrawn.checked_add(final_withdrawal_amount).ok_or(FundError::MathOverflow)?;
    investor_position.last_activity_at = clock.unix_timestamp;

    // Update withdrawal state
    let withdrawal_state = &mut ctx.accounts.withdrawal_state;
    withdrawal_state.status = WithdrawalStatus::Completed;

    Ok(())
}
