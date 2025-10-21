use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint};
use crate::state::Fund;

#[derive(Accounts)]
pub struct RepairVault<'info> {
    #[account(
        mut,
        seeds = [b"fund", fund.manager.as_ref(), fund.name.as_bytes()],
        bump = fund.bump,
        has_one = manager
    )]
    pub fund: Account<'info, Fund>,

    /// Manager must authorize the repair (pays rent for the new token account)
    pub manager: Signer<'info>,

    /// PDA for SPL vault (TokenAccount) that holds WSOL when base_mint is native
    /// If missing, this instruction will create and initialize it.
    #[account(
        mut,
        seeds = [b"vault", fund.key().as_ref()],
        bump = fund.vault_bump
    )]
    /// CHECK: Will be created if missing; validated/initialized as TokenAccount in instruction
    pub vault: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
    /// The base mint account (must match fund.base_mint)
    pub base_mint: Account<'info, Mint>,
}

pub fn repair_vault(ctx: Context<RepairVault>) -> Result<()> {
    // If vault is already a token account, no-op
    if !ctx.accounts.vault.data_is_empty() {
        return Ok(());
    }

    // Allocate the account at the PDA with the Token program as owner
    let rent = &ctx.accounts.rent;
    let lamports = rent.minimum_balance(TokenAccount::LEN);
    let space = TokenAccount::LEN as u64;

    let fund_key = ctx.accounts.fund.key();
    let seeds: &[&[u8]] = &[b"vault", fund_key.as_ref(), &[ctx.accounts.fund.vault_bump]];
    let signer_seeds: &[&[&[u8]]] = &[seeds];

    // Create the account owned by SPL Token program
    let ca = anchor_lang::system_program::CreateAccount {
        from: ctx.accounts.manager.to_account_info(),
        to: ctx.accounts.vault.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.system_program.to_account_info(),
        ca,
        signer_seeds,
    );
    anchor_lang::system_program::create_account(cpi_ctx, lamports, space, &token::ID)?;

    // Initialize as TokenAccount for base_mint with owner = fund via CPI helper
    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        anchor_spl::token::InitializeAccount3 {
            account: ctx.accounts.vault.to_account_info(),
            mint: ctx.accounts.base_mint.to_account_info(),
            authority: ctx.accounts.fund.to_account_info(),
        },
    );
    token::initialize_account3(cpi_ctx)?;

    Ok(())
}
