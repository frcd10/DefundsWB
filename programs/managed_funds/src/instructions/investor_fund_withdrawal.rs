use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::*;

#[derive(Accounts)]
pub struct InvestorFundWithdrawal<'info> {
    #[account(mut)]
    pub investor: Signer<'info>,

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

    /// PDA that holds SOL for the fund
    #[account(
        mut,
        seeds = [b"vault_sol", fund.key().as_ref()],
        bump
    )]
    /// CHECK: System owned PDA to hold SOL; lamports are transferred via CPI
    pub vault_sol_account: AccountInfo<'info>,

    /// CHECK: Fund manager receives performance fee share
    #[account(mut)]
    pub manager: AccountInfo<'info>,

    /// CHECK: Platform treasury receives platform fees
    #[account(mut)]
    pub treasury: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
    // token program not needed for SOL-only flow
}

/// Withdraw 100% of investor's participation in SOL-only mode.
/// For devnet, we skip swapping token positions and only distribute proportional SOL from vault.
pub fn investor_fund_withdrawal(ctx: Context<InvestorFundWithdrawal>) -> Result<()> {
    let fund = &mut ctx.accounts.fund;
    let position = &mut ctx.accounts.investor_position;

    require!(position.shares > 0, FundError::InvalidShares);

    // Determine investor share of the SOL vault by fund share ratio
    let vault_balance = ctx.accounts.vault_sol_account.lamports();
    require!(vault_balance > 0, FundError::InsufficientFunds);

    require!(fund.total_shares > 0, FundError::InvalidShares);
    let investor_value = ((vault_balance as u128)
        .checked_mul(position.shares as u128).ok_or(FundError::MathOverflow)?
        .checked_div(fund.total_shares as u128).ok_or(FundError::MathOverflow)?) as u64;

    // Fees: 1% platform withdrawal + performance on profit
    let platform_fee = investor_value / 100; // 1%
    let after_platform = investor_value.checked_sub(platform_fee).ok_or(FundError::MathOverflow)?;

    // Profit vs initial investment (approx using initial_investment)
    let initial_investment = position.initial_investment;
    let profit = if investor_value > initial_investment { investor_value - initial_investment } else { 0 };
    let perf_bps = fund.performance_fee.min(5000); // cap at 50%
    let performance_fee = ((profit as u128)
        .checked_mul(perf_bps as u128).ok_or(FundError::MathOverflow)?
        .checked_div(10_000)).ok_or(FundError::MathOverflow)? as u64;
    let treasury_perf_share = performance_fee / 5; // 20%
    let manager_perf_share = performance_fee.checked_sub(treasury_perf_share).ok_or(FundError::MathOverflow)?;

    let amount_to_investor = after_platform.checked_sub(performance_fee).ok_or(FundError::MathOverflow)?;
    let total_treasury = platform_fee.checked_add(treasury_perf_share).ok_or(FundError::MathOverflow)?;

    // Ensure vault has enough SOL
    require!(ctx.accounts.vault_sol_account.lamports() >= investor_value, FundError::InsufficientFunds);

    // Signer seeds for vault SOL PDA
    let fund_key = fund.key();
    let vault_bump = ctx.bumps.vault_sol_account;
    let bump_seed = [vault_bump];
    let seeds: &[&[u8]] = &[b"vault_sol".as_ref(), fund_key.as_ref(), &bump_seed];

    // Transfer to investor
    if amount_to_investor > 0 {
        let cpi_accounts = anchor_lang::system_program::Transfer {
            from: ctx.accounts.vault_sol_account.to_account_info(),
            to: ctx.accounts.investor.to_account_info(),
        };
    let signer = &[seeds];
    let cpi_ctx = CpiContext::new_with_signer(ctx.accounts.system_program.to_account_info(), cpi_accounts, signer);
        anchor_lang::system_program::transfer(cpi_ctx, amount_to_investor)?;
    }

    // Transfer manager performance share
    if manager_perf_share > 0 {
        let cpi_accounts = anchor_lang::system_program::Transfer {
            from: ctx.accounts.vault_sol_account.to_account_info(),
            to: ctx.accounts.manager.to_account_info(),
        };
    let signer = &[seeds];
    let cpi_ctx = CpiContext::new_with_signer(ctx.accounts.system_program.to_account_info(), cpi_accounts, signer);
        anchor_lang::system_program::transfer(cpi_ctx, manager_perf_share)?;
    }

    // Transfer platform fees to treasury
    if total_treasury > 0 {
        let cpi_accounts = anchor_lang::system_program::Transfer {
            from: ctx.accounts.vault_sol_account.to_account_info(),
            to: ctx.accounts.treasury.to_account_info(),
        };
    let signer = &[seeds];
    let cpi_ctx = CpiContext::new_with_signer(ctx.accounts.system_program.to_account_info(), cpi_accounts, signer);
        anchor_lang::system_program::transfer(cpi_ctx, total_treasury)?;
    }

    // Update state: remove investor shares and reduce total_shares/assets approximately by investor_value
    fund.total_shares = fund.total_shares.checked_sub(position.shares).ok_or(FundError::MathOverflow)?;
    fund.total_assets = fund.total_assets.saturating_sub(investor_value);
    position.shares = 0;
    position.total_withdrawn = position.total_withdrawn.saturating_add(amount_to_investor);
    position.last_activity_at = Clock::get()?.unix_timestamp;

    Ok(())
}
