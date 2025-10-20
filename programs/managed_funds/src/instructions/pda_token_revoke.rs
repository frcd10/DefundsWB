use anchor_lang::prelude::*;
use anchor_spl::token::{self, Revoke as SplRevoke, Token, TokenAccount};
use crate::state::Fund;

#[derive(Accounts)]
pub struct PdaTokenRevoke<'info> {
    #[account(
        mut,
        seeds = [b"fund", fund.manager.as_ref(), fund.name.as_bytes()],
        bump = fund.bump
    )]
    pub fund: Account<'info, Fund>,

    #[account(mut)]
    pub source: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,

    // Only fund manager may trigger revoke
    pub manager: Signer<'info>,
}

pub fn pda_token_revoke(ctx: Context<PdaTokenRevoke>) -> Result<()> {
    require_keys_eq!(ctx.accounts.manager.key(), ctx.accounts.fund.manager);
    // Ensure the source is owned by the fund PDA
    require_keys_eq!(ctx.accounts.source.owner, ctx.accounts.fund.key());

    let f = &ctx.accounts.fund;
    let bump = f.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[b"fund", f.manager.as_ref(), f.name.as_bytes(), &[bump]]];

    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        SplRevoke {
            source: ctx.accounts.source.to_account_info(),
            authority: f.to_account_info(),
        },
        signer_seeds,
    );
    token::revoke(cpi_ctx)?;
    Ok(())
}
