use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, CloseAccount, Mint, Token, TokenAccount, Transfer};
use crate::state::*;
use crate::errors::*;

#[derive(Accounts)]
pub struct ReturnFunds<'info> {
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
        token::mint = fund.base_mint,
        token::authority = fund
    )]
    pub vault: Account<'info, TokenAccount>,

    /// The base mint (e.g., WSOL) of the vault
    pub base_mint: Account<'info, Mint>,

    /// Destination wallet to receive returned funds
    /// CHECK: only used as associated token authority and SOL recipient
    pub destination: UncheckedAccount<'info>,

    /// Destination associated token account for base_mint
    #[account(
        init_if_needed,
        payer = manager,
        associated_token::mint = base_mint,
        associated_token::authority = destination
    )]
    pub destination_ata: Account<'info, TokenAccount>,

    /// Manager who authorizes the return
    pub manager: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn return_funds(ctx: Context<ReturnFunds>) -> Result<()> {
    let fund = &ctx.accounts.fund;
    let vault = &ctx.accounts.vault;

    // If nothing to transfer, still attempt to close to reclaim rent
    let amount = vault.amount;

    if amount > 0 {
        // Transfer all tokens from vault to destination ATA
        let fund_seeds: &[&[u8]] = &[
            b"fund",
            fund.manager.as_ref(),
            fund.name.as_bytes(),
            &[fund.bump],
        ];
        let signer = &[fund_seeds];

        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.destination_ata.to_account_info(),
                authority: fund.to_account_info(),
            },
            signer,
        );
        token::transfer(cpi_ctx, amount)?;
    }

    // Close the vault token account and send rent lamports to destination
    // Requires amount == 0; after transfer above, it should be
    let fund_seeds: &[&[u8]] = &[
        b"fund",
        fund.manager.as_ref(),
        fund.name.as_bytes(),
        &[fund.bump],
    ];
    let signer = &[fund_seeds];

    let cpi_ctx_close = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        CloseAccount {
            account: ctx.accounts.vault.to_account_info(),
            destination: ctx.accounts.destination.to_account_info(),
            authority: fund.to_account_info(),
        },
        signer,
    );
    // Ignore error if already closed or not closable; return success
    let _ = token::close_account(cpi_ctx_close);

    Ok(())
}
