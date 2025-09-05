use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Burn, Transfer};
use crate::state::*;
use crate::errors::*;

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(
        mut,
        seeds = [b"fund", fund.manager.as_ref(), fund.name.as_bytes()],
        bump = fund.bump
    )]
    pub fund: Account<'info, Fund>,

    #[account(
        mut,
        seeds = [b"vault", fund.key().as_ref()],
        bump = fund.vault_bump,
        token::mint = fund.base_mint,
        token::authority = fund
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"shares", fund.key().as_ref()],
        bump = fund.shares_bump,
        mint::authority = fund
    )]
    pub shares_mint: Account<'info, anchor_spl::token::Mint>,

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
        token::mint = fund.base_mint,
        token::authority = investor
    )]
    pub investor_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = shares_mint,
        token::authority = investor
    )]
    pub investor_shares_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub investor: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn withdraw(ctx: Context<Withdraw>, shares_to_burn: u64) -> Result<()> {
    require!(shares_to_burn > 0, FundError::InvalidShares);

    let fund = &mut ctx.accounts.fund;
    let investor_position = &mut ctx.accounts.investor_position;
    let clock = Clock::get()?;

    // Verify investor has enough shares
    require!(
        investor_position.shares >= shares_to_burn,
        FundError::InsufficientFunds
    );

    // Calculate withdrawal amount based on current fund valuation
    let withdrawal_amount = fund.calculate_withdrawal_amount(shares_to_burn);

    // Verify fund has enough assets
    require!(
        ctx.accounts.vault.amount >= withdrawal_amount,
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

    // Transfer tokens from fund vault to investor
    let fund_seeds = &[
        b"fund",
        fund.manager.as_ref(),
        fund.name.as_bytes(),
        &[fund.bump],
    ];
    let signer = &[&fund_seeds[..]];

    let transfer_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.investor_token_account.to_account_info(),
            authority: fund.to_account_info(),
        },
        signer,
    );
    token::transfer(transfer_ctx, withdrawal_amount)?;

    // Update fund state
    fund.total_assets = fund.total_assets.checked_sub(withdrawal_amount).ok_or(FundError::MathOverflow)?;
    fund.total_shares = fund.total_shares.checked_sub(shares_to_burn).ok_or(FundError::MathOverflow)?;

    // Update investor position
    investor_position.shares = investor_position.shares.checked_sub(shares_to_burn).ok_or(FundError::MathOverflow)?;
    investor_position.total_withdrawn = investor_position.total_withdrawn.checked_add(withdrawal_amount).ok_or(FundError::MathOverflow)?;
    investor_position.last_activity_at = clock.unix_timestamp;

    msg!(
        "Withdrew {} tokens from fund '{}', burned {} shares",
        withdrawal_amount,
        fund.name,
        shares_to_burn
    );

    Ok(())
}
