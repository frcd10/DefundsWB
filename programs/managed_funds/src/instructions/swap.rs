use anchor_lang::prelude::*;
use anchor_spl::token::{self, Approve, Revoke, Token, TokenAccount};
use crate::state::*;
use crate::errors::*;

#[derive(Accounts)]
#[instruction(input_mint: Pubkey, amount_in: u64)]
pub struct AuthorizeDefundSwap<'info> {
    #[account(
        mut,
        seeds = [b"fund", fund.manager.as_ref(), fund.name.as_bytes()],
        bump = fund.bump,
        has_one = manager
    )]
    pub fund: Account<'info, Fund>,

    #[account(
        mut,
        seeds = [b"vault", fund.key().as_ref()],
        bump = fund.vault_bump,
        token::authority = fund
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub manager: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct RevokeDefundSwap<'info> {
    #[account(
        mut,
        seeds = [b"fund", fund.manager.as_ref(), fund.name.as_bytes()],
        bump = fund.bump,
        has_one = manager
    )]
    pub fund: Account<'info, Fund>,

    #[account(
        mut,
        seeds = [b"vault", fund.key().as_ref()],
        bump = fund.vault_bump,
        token::authority = fund
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub manager: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[event]
pub struct DefundSwapAuthorized {
    pub fund: Pubkey,
    pub manager: Pubkey,
    pub input_mint: Pubkey,
    pub amount_in: u64,
}

#[event]
pub struct DefundSwapRevoked {
    pub fund: Pubkey,
    pub manager: Pubkey,
}

pub fn authorize_defund_swap(
    ctx: Context<AuthorizeDefundSwap>,
    input_mint: Pubkey,
    amount_in: u64,
) -> Result<()> {
    require!(amount_in > 0, FundError::InvalidAmount);

    let fund = &ctx.accounts.fund;
    let vault = &ctx.accounts.vault;

    // Ensure the swap spends from the vault's mint (we trade from/to base mint in this version)
    require!(vault.mint == fund.base_mint, FundError::InvalidMint);
    require!(input_mint == vault.mint, FundError::InvalidMint);

    // Approve manager as delegate on the vault token account for amount_in.
    // This lets the off-chain Jupiter swap transaction move tokens from the vault
    // while being signed by the manager (delegate), not the PDA itself.
    let signer_seeds: &[&[&[u8]]] = &[&[
        b"fund",
        fund.manager.as_ref(),
        fund.name.as_bytes(),
        &[fund.bump],
    ]];

    let cpi_accounts = Approve {
        to: vault.to_account_info(),
        delegate: ctx.accounts.manager.to_account_info(),
        authority: fund.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
        signer_seeds,
    );
    token::approve(cpi_ctx, amount_in)?;

    emit!(DefundSwapAuthorized {
        fund: fund.key(),
        manager: ctx.accounts.manager.key(),
        input_mint,
        amount_in,
    });

    Ok(())
}

pub fn revoke_defund_swap(ctx: Context<RevokeDefundSwap>) -> Result<()> {
    let fund = &ctx.accounts.fund;
    let vault = &ctx.accounts.vault;

    let signer_seeds: &[&[&[u8]]] = &[&[
        b"fund",
        fund.manager.as_ref(),
        fund.name.as_bytes(),
        &[fund.bump],
    ]];

    let cpi_accounts = Revoke {
        source: vault.to_account_info(),
        authority: fund.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
        signer_seeds,
    );
    token::revoke(cpi_ctx)?;

    emit!(DefundSwapRevoked { fund: fund.key(), manager: ctx.accounts.manager.key() });
    Ok(())
}
