use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Token, TokenAccount};
use crate::state::Fund;

#[derive(Accounts)]
pub struct UnwrapWsolFund<'info> {
    #[account(
        mut,
        seeds = [b"fund", fund.manager.as_ref(), fund.name.as_bytes()],
        bump = fund.bump
    )]
    pub fund: Account<'info, Fund>,

    #[account(
        mut,
        token::mint = anchor_spl::token::spl_token::native_mint::id(),
        token::authority = fund
    )]
    pub fund_wsol_ata: Account<'info, TokenAccount>,

    /// Destination for unwrapped SOL (Fund PDA lamports account)
    /// CHECK: destination is the Fund PDA system account
    #[account(mut)]
    pub destination: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn unwrap_wsol_fund(ctx: Context<UnwrapWsolFund>) -> Result<()> {
    // Close WSOL ATA, sending lamports back to Fund PDA
    let f = &ctx.accounts.fund;
    let bump = f.bump;
    let seeds: &[&[u8]] = &[b"fund", f.manager.as_ref(), f.name.as_bytes(), &[bump]];
    let signer_seeds: &[&[&[u8]]] = &[seeds];

    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        CloseAccount {
            account: ctx.accounts.fund_wsol_ata.to_account_info(),
            destination: ctx.accounts.destination.to_account_info(),
            authority: f.to_account_info(),
        },
        signer_seeds,
    );
    token::close_account(cpi_ctx)
}
