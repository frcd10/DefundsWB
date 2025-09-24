use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::*;

#[derive(Accounts)]
pub struct PayFundInvestors<'info> {
    #[account(mut)]
    pub manager: Signer<'info>,

    #[account(
        mut,
        seeds = [b"fund", fund.manager.as_ref(), fund.name.as_bytes()],
        bump = fund.bump,
        has_one = manager
    )]
    pub fund: Account<'info, Fund>,

    /// PDA that holds SOL for the fund
    #[account(
        mut,
        seeds = [b"vault_sol", fund.key().as_ref()],
        bump
    )]
    /// CHECK: System owned PDA to hold SOL; lamports are transferred via CPI
    pub vault_sol_account: AccountInfo<'info>,

    /// Treasury wallet for platform fees
    #[account(mut)]
    /// CHECK: Platform treasury receives SOL
    pub treasury: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

/// Distribute `total_amount` SOL from the vault to a batch of investors by share percentage.
/// Remaining accounts must come in pairs per investor: [InvestorPosition, Investor System Account].
pub fn pay_fund_investors<'info>(
    ctx: Context<'_, '_, 'info, 'info, PayFundInvestors<'info>>,
    total_amount: u64,
) -> Result<()> {
    require!(total_amount > 0, FundError::InvalidAmount);

    let fund = &ctx.accounts.fund;
    let perf_bps = fund.performance_fee; // 0..=5000 (0-50%)
    require!(perf_bps <= 5000, FundError::InvalidFee);

    // Fees
    let base_fee = total_amount / 100; // 1%
    let after_base = total_amount
        .checked_sub(base_fee)
        .ok_or(FundError::MathOverflow)?;
    let performance_fee = ((after_base as u128)
        .checked_mul(perf_bps as u128)
        .ok_or(FundError::MathOverflow)?
        / 10_000) as u64;
    let treasury_perf_share = performance_fee / 5; // 20%
    let manager_perf_share = performance_fee
        .checked_sub(treasury_perf_share)
        .ok_or(FundError::MathOverflow)?; // 80%
    let investor_pool = after_base
        .checked_sub(performance_fee)
        .ok_or(FundError::MathOverflow)?;

    // Ensure the SOL vault PDA account exists (system-owned, zero data) — create on first use
    let fund_key = fund.key();
    let bump_seed = [ctx.bumps.vault_sol_account];
    let fund_seeds: [&[u8]; 3] = [b"vault_sol".as_ref(), fund_key.as_ref(), &bump_seed];
    if ctx.accounts.vault_sol_account.lamports() == 0 {
        let cpi_accounts = anchor_lang::system_program::CreateAccount {
            from: ctx.accounts.manager.to_account_info(),
            to: ctx.accounts.vault_sol_account.to_account_info(),
        };
        let signer = &[&fund_seeds[..]];
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            cpi_accounts,
            signer,
        );
        // Zero space system-owned account is valid; rent-exemption for 0 space is 0 lamports
        anchor_lang::system_program::create_account(cpi_ctx, 0, 0, &anchor_lang::system_program::ID)?;
    }

    // Top-up vault from manager by the total_amount so distribution is from the vault
    {
        let cpi_accounts = anchor_lang::system_program::Transfer {
            from: ctx.accounts.manager.to_account_info(),
            to: ctx.accounts.vault_sol_account.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.system_program.to_account_info(), cpi_accounts);
        anchor_lang::system_program::transfer(cpi_ctx, total_amount)?;
    }

    // Ensure vault has enough SOL after top-up
    let vault_balance = ctx.accounts.vault_sol_account.lamports();
    require!(vault_balance >= total_amount, FundError::InsufficientFunds);

    // Compute total shares for batch distribution from pairs
    require!(ctx.remaining_accounts.len() % 2 == 0, FundError::InvalidInput);
    let mut batch_total_shares: u128 = 0;
    let mut recipients: Vec<(&AccountInfo, u64)> = Vec::with_capacity(ctx.remaining_accounts.len() / 2);
    for pair in ctx.remaining_accounts.chunks(2) {
        let pos_ai = &pair[0];
        let inv_ai = &pair[1];
        let pos: Account<InvestorPosition> = Account::try_from(pos_ai)?;
        // Sanity checks
        require!(pos.fund == fund.key(), FundError::InvalidInput);
        require!(pos.investor == inv_ai.key(), FundError::InvalidInput);

        batch_total_shares = batch_total_shares
            .checked_add(pos.shares as u128)
            .ok_or(FundError::MathOverflow)?;
        recipients.push((inv_ai, pos.shares));
    }
    require!(batch_total_shares > 0, FundError::InvalidShares);

    // Helper to perform SOL transfer from vault PDA using seeds

    // 1) Pay treasury: base fee + 20% of performance fee
    let treasury_total = base_fee
        .checked_add(treasury_perf_share)
        .ok_or(FundError::MathOverflow)?;
    if treasury_total > 0 {
        let cpi_accounts = anchor_lang::system_program::Transfer {
            from: ctx.accounts.vault_sol_account.to_account_info(),
            to: ctx.accounts.treasury.to_account_info(),
        };
        let signer = &[&fund_seeds[..]];
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            cpi_accounts,
            signer,
        );
        anchor_lang::system_program::transfer(cpi_ctx, treasury_total)?;
    }

    // 2) Pay manager performance share
    if manager_perf_share > 0 {
        let cpi_accounts = anchor_lang::system_program::Transfer {
            from: ctx.accounts.vault_sol_account.to_account_info(),
            to: ctx.accounts.manager.to_account_info(),
        };
        let signer = &[&fund_seeds[..]];
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            cpi_accounts,
            signer,
        );
        anchor_lang::system_program::transfer(cpi_ctx, manager_perf_share)?;
    }

    // 3) Distribute investor_pool pro-rata across provided positions
    let mut distributed: u64 = 0;
    for (i, (investor_ai, shares)) in recipients.iter().enumerate() {
        let share_amount = if i == recipients.len() - 1 {
            // give remainder to last recipient to ensure exact sum
            investor_pool.checked_sub(distributed).ok_or(FundError::MathOverflow)?
        } else {
            (((investor_pool as u128)
                .checked_mul(*shares as u128)
                .ok_or(FundError::MathOverflow)?
                )
                .checked_div(batch_total_shares)
                .ok_or(FundError::MathOverflow)?) as u64
        };

        if share_amount > 0 {
            let cpi_accounts = anchor_lang::system_program::Transfer {
                from: ctx.accounts.vault_sol_account.to_account_info(),
                to: (*investor_ai).clone(),
            };
            let signer = &[&fund_seeds[..]];
            let cpi_ctx = CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                cpi_accounts,
                signer,
            );
            anchor_lang::system_program::transfer(cpi_ctx, share_amount)?;
            distributed = distributed.checked_add(share_amount).ok_or(FundError::MathOverflow)?;
        }
    }

    Ok(())
}
