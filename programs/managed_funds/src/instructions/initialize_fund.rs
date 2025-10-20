use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Mint};
use crate::state::*;

#[derive(Accounts)]
#[instruction(name: String)]
pub struct InitializeFund<'info> {
    #[account(
        init,
        payer = manager,
        space = Fund::SPACE,
        seeds = [b"fund", manager.key().as_ref(), name.as_bytes()],
        bump
    )]
    pub fund: Account<'info, Fund>,

    #[account(
        init,
        payer = manager,
        token::mint = base_mint,
        token::authority = fund,
        seeds = [b"vault", fund.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = manager,
        mint::decimals = 6,
        mint::authority = fund,
        seeds = [b"shares", fund.key().as_ref()],
        bump
    )]
    pub shares_mint: Account<'info, Mint>,

    pub base_mint: Account<'info, Mint>,

    #[account(mut)]
    pub manager: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn initialize_fund(
    ctx: Context<InitializeFund>,
    name: String,
    description: String,
    management_fee: u16,
    performance_fee: u16,
) -> Result<()> {
    let fund = &mut ctx.accounts.fund;
    let clock = Clock::get()?;

    fund.manager = ctx.accounts.manager.key();
    fund.name = name;
    fund.description = description;
    fund.base_mint = ctx.accounts.base_mint.key();
    fund.vault = ctx.accounts.vault.key();
    fund.shares_mint = ctx.accounts.shares_mint.key();
    fund.management_fee = management_fee;
    fund.performance_fee = performance_fee;
    fund.total_shares = 0;
    fund.total_assets = 0;
    fund.last_fee_collection = clock.unix_timestamp;
    fund.created_at = clock.unix_timestamp;
    fund.bump = ctx.bumps.fund;
    fund.vault_bump = ctx.bumps.vault;
    fund.shares_bump = ctx.bumps.shares_mint;

    Ok(())
}
