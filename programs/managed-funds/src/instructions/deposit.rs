use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer, MintTo};
use crate::state::*;
use crate::errors::*;

#[derive(Accounts)]
pub struct Deposit<'info> {
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
    pub shares_mint: Account<'info, Mint>,

    #[account(
        init_if_needed,
        payer = investor,
        space = InvestorPosition::SPACE,
        seeds = [b"position", investor.key().as_ref(), fund.key().as_ref()],
        bump
    )]
    pub investor_position: Account<'info, InvestorPosition>,

    #[account(
        mut,
        token::mint = fund.base_mint,
        token::authority = investor
    )]
    pub investor_token_account: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = investor,
        token::mint = shares_mint,
        token::authority = investor
    )]
    pub investor_shares_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub investor: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    require!(amount > 0, FundError::InvalidAmount);

    let fund = &mut ctx.accounts.fund;
    let investor_position = &mut ctx.accounts.investor_position;
    let clock = Clock::get()?;

    // Calculate shares to mint based on current fund valuation
    let shares_to_mint = fund.calculate_shares_to_mint(amount);

    // Transfer tokens from investor to fund vault
    let transfer_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.investor_token_account.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.investor.to_account_info(),
        },
    );
    token::transfer(transfer_ctx, amount)?;

    // Mint shares to investor
    let fund_seeds = &[
        b"fund",
        fund.manager.as_ref(),
        fund.name.as_bytes(),
        &[fund.bump],
    ];
    let signer = &[&fund_seeds[..]];

    let mint_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        MintTo {
            mint: ctx.accounts.shares_mint.to_account_info(),
            to: ctx.accounts.investor_shares_account.to_account_info(),
            authority: fund.to_account_info(),
        },
        signer,
    );
    token::mint_to(mint_ctx, shares_to_mint)?;

    // Update fund state
    fund.total_assets = fund.total_assets.checked_add(amount).ok_or(FundError::MathOverflow)?;
    fund.total_shares = fund.total_shares.checked_add(shares_to_mint).ok_or(FundError::MathOverflow)?;

    // Update investor position
    if investor_position.investor == Pubkey::default() {
        // First deposit for this investor
        investor_position.investor = ctx.accounts.investor.key();
        investor_position.fund = fund.key();
        investor_position.shares = shares_to_mint;
        investor_position.initial_investment = amount;
        investor_position.total_deposited = amount;
        investor_position.total_withdrawn = 0;
        investor_position.first_deposit_at = clock.unix_timestamp;
        investor_position.last_activity_at = clock.unix_timestamp;
    } else {
        // Subsequent deposit
        investor_position.shares = investor_position.shares.checked_add(shares_to_mint).ok_or(FundError::MathOverflow)?;
        investor_position.total_deposited = investor_position.total_deposited.checked_add(amount).ok_or(FundError::MathOverflow)?;
        investor_position.last_activity_at = clock.unix_timestamp;
    }

    msg!(
        "Deposited {} tokens to fund '{}', minted {} shares",
        amount,
        fund.name,
        shares_to_mint
    );

    Ok(())
}
