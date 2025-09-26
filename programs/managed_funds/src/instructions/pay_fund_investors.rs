use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer};
// Removed unused CloseAccount, InitializeAccount, spl_token, and Pack import
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

    /// SPL vault that holds WSOL when base_mint is the native mint
    #[account(
        mut,
        seeds = [b"vault", fund.key().as_ref()],
        bump = fund.vault_bump,
        token::mint = fund.base_mint,
        token::authority = fund
    )]
    pub vault: Account<'info, TokenAccount>,

    // Move system program earlier to match on-chain account order expectations
    pub system_program: Program<'info, System>,

    /// Base mint (must be NATIVE_MINT for WSOL unwrapping path)
    pub base_mint: Account<'info, Mint>,

    /// Temporary WSOL token account PDA (created and closed within this ix)
    /// CHECK: PDA created by this instruction, owned by token program, closed by end
    #[account(mut)]
    pub temp_wsol_account: AccountInfo<'info>,

    /// Treasury wallet for platform fees
    #[account(mut)]
    /// CHECK: Platform treasury receives SOL
    pub treasury: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

/// Distribute `total_amount` SOL from the vault to a batch of investors by share percentage.
/// Remaining accounts must come in pairs per investor: [InvestorPosition, Investor System Account].
pub fn pay_fund_investors<'info>(
    ctx: Context<'_, '_, 'info, 'info, PayFundInvestors<'info>>,
    total_amount: u64,
) -> Result<()> {
    require!(total_amount > 0, FundError::InvalidAmount);
    msg!("pay_fund_investors: total_amount={} lamports", total_amount);

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

    // Prepare signer seeds for vault transfers
    let fund_key = fund.key();
    let bump_seed = [ctx.bumps.vault_sol_account];
    let fund_seeds: [&[u8]; 3] = [b"vault_sol".as_ref(), fund_key.as_ref(), &bump_seed];

    // Ensure the SOL vault PDA account exists (system-owned, zero data) — create on first use with 0 lamports
    if ctx.accounts.vault_sol_account.data_is_empty() && ctx.accounts.vault_sol_account.lamports() == 0 {
        msg!("creating vault_sol_account (system-owned PDA) with 0 lamports");
        let cpi_accounts = anchor_lang::system_program::CreateAccount {
            from: ctx.accounts.manager.to_account_info(),
            to: ctx.accounts.vault_sol_account.to_account_info(),
        };
        let signer_arr: [&[&[u8]]; 1] = [&fund_seeds[..]];
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            cpi_accounts,
            &signer_arr,
        );
        // Zero space system-owned account is valid; rent-exemption for 0 space is 0 lamports
        anchor_lang::system_program::create_account(cpi_ctx, 0, 0, &anchor_lang::system_program::ID)?;
    }

    // Branch: use SOL PDA if sufficient balance; otherwise, WSOL fallback.
    let vault_sol_balance = ctx.accounts.vault_sol_account.lamports();
    if vault_sol_balance < total_amount {
        msg!("WSOL fallback path: vault SOL balance {} < total {}", vault_sol_balance, total_amount);
        // Fall back to distributing WSOL tokens from SPL vault.
            // Expect remaining accounts layout: For each investor -> [InvestorPosition, Investor System, Investor WSOL ATA]
            // and at the END two accounts: [Treasury WSOL ATA, Manager WSOL ATA]
            require!(ctx.remaining_accounts.len() >= 2, FundError::InvalidInput);
            let fee_atas_split = ctx.remaining_accounts.len() - 2;
            let (recipient_slice, fee_atas) = ctx.remaining_accounts.split_at(fee_atas_split);
            require!(recipient_slice.len() % 3 == 0, FundError::InvalidInput);

            // Calculate fees and investor distribution amounts (already computed above)
            let treasury_total = base_fee
                .checked_add(treasury_perf_share)
                .ok_or(FundError::MathOverflow)?;

            // Build fund authority signer seeds
            let fund_manager_key = ctx.accounts.fund.manager;
            let fund_name_bytes = ctx.accounts.fund.name.as_bytes();
            let fund_bump_bytes = [ctx.accounts.fund.bump];
            let fund_auth_seeds_arr: [&[u8]; 4] = [
                b"fund",
                fund_manager_key.as_ref(),
                fund_name_bytes,
                &fund_bump_bytes,
            ];
            let fund_auth_seeds: &[&[u8]] = &fund_auth_seeds_arr;
            let fund_signer_arr: [&[&[u8]]; 1] = [fund_auth_seeds];

            // 1) Pay treasury in WSOL
            if treasury_total > 0 {
                msg!("WSOL: transferring {} to treasury ATA", treasury_total);
                let cpi_ctx = CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.vault.to_account_info(),
                        to: fee_atas[0].clone(), // Treasury WSOL ATA
                        authority: ctx.accounts.fund.to_account_info(),
                    },
                    &fund_signer_arr,
                );
                token::transfer(cpi_ctx, treasury_total)?;
            }

            // 2) Pay manager performance share in WSOL
            if manager_perf_share > 0 {
                msg!("WSOL: transferring {} to manager ATA", manager_perf_share);
                let cpi_ctx = CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.vault.to_account_info(),
                        to: fee_atas[1].clone(), // Manager WSOL ATA
                        authority: ctx.accounts.fund.to_account_info(),
                    },
                    &fund_signer_arr,
                );
                token::transfer(cpi_ctx, manager_perf_share)?;
            }

            // 3) Distribute investor_pool pro-rata to WSOL ATAs
            let mut batch_total_shares: u128 = 0;
            let mut recipients: Vec<(&AccountInfo, u64, &AccountInfo)> = Vec::with_capacity(recipient_slice.len() / 3);
            for triple in recipient_slice.chunks(3) {
                let pos_ai = &triple[0];
                let inv_ai = &triple[1];
                let ata_ai = &triple[2];
                let pos: Account<InvestorPosition> = Account::try_from(pos_ai)?;
                require!(pos.fund == fund.key(), FundError::InvalidInput);
                require!(pos.investor == inv_ai.key(), FundError::InvalidInput);
                batch_total_shares = batch_total_shares
                    .checked_add(pos.shares as u128)
                    .ok_or(FundError::MathOverflow)?;
                recipients.push((inv_ai, pos.shares, ata_ai));
            }
            require!(batch_total_shares > 0, FundError::InvalidShares);

            let mut distributed: u64 = 0;
            for (i, (_investor_ai, shares, ata_ai)) in recipients.iter().enumerate() {
                let share_amount = if i == recipients.len() - 1 {
                    investor_pool.checked_sub(distributed).ok_or(FundError::MathOverflow)?
                } else {
                    (((investor_pool as u128)
                        .checked_mul(*shares as u128)
                        .ok_or(FundError::MathOverflow)?)
                        .checked_div(batch_total_shares)
                        .ok_or(FundError::MathOverflow)?) as u64
                };

                if share_amount > 0 {
                    msg!("WSOL: transferring {} to investor {} of {} recipients", share_amount, i + 1, recipients.len());
                    let cpi_ctx = CpiContext::new_with_signer(
                        ctx.accounts.token_program.to_account_info(),
                        Transfer {
                            from: ctx.accounts.vault.to_account_info(),
                            to: (*ata_ai).clone(),
                            authority: ctx.accounts.fund.to_account_info(),
                        },
                        &fund_signer_arr,
                    );
                    token::transfer(cpi_ctx, share_amount)?;
                    distributed = distributed.checked_add(share_amount).ok_or(FundError::MathOverflow)?;
                }
            }

            // Decrease fund total_assets to reflect the payout leaving the fund
            let fund_mut = &mut ctx.accounts.fund;
            msg!("WSOL: decreasing fund.total_assets by {}", total_amount);
            fund_mut.total_assets = fund_mut
                .total_assets
                .checked_sub(total_amount)
                .ok_or(FundError::MathOverflow)?;

            return Ok(());
    }

    // SOL path (vault SOL balance is sufficient)

    // Compute total shares for batch distribution from pairs (SOL path)
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

    // Helper to perform SOL transfer from vault PDA using seeds (SOL path)
    msg!("SOL path: vault SOL balance sufficient");

    // 1) Pay treasury: base fee + 20% of performance fee
    let treasury_total = base_fee
        .checked_add(treasury_perf_share)
        .ok_or(FundError::MathOverflow)?;
    if treasury_total > 0 {
        msg!("SOL: transferring {} to treasury", treasury_total);
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
        msg!("SOL: transferring {} to manager", manager_perf_share);
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
            msg!("SOL: transferring {} to investor {} of {} recipients", share_amount, i + 1, recipients.len());
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

    // Decrease fund total_assets to reflect the payout leaving the fund
    let fund_mut = &mut ctx.accounts.fund;
    msg!("SOL: decreasing fund.total_assets by {}", total_amount);
    fund_mut.total_assets = fund_mut
        .total_assets
        .checked_sub(total_amount)
        .ok_or(FundError::MathOverflow)?;

    Ok(())
}
