use anchor_lang::prelude::*;
use anchor_spl::token::{self, Approve as SplApprove, Revoke as SplRevoke, Token, TokenAccount};
use crate::state::Fund;

#[derive(Accounts)]
pub struct PdaTokenApprove<'info> {
    #[account(
        mut,
        seeds = [b"fund", fund.manager.as_ref(), fund.name.as_bytes()],
        bump = fund.bump
    )]
    pub fund: Account<'info, Fund>,

    #[account(mut)]
    pub source: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,

    // Manager acts as the delegate; must be the configured fund.manager
    pub manager: Signer<'info>,
}

pub fn pda_token_approve(ctx: Context<PdaTokenApprove>, amount: u64) -> Result<()> {
    require_keys_eq!(ctx.accounts.manager.key(), ctx.accounts.fund.manager);
    // Ensure the source is owned by the fund PDA
    require_keys_eq!(ctx.accounts.source.owner, ctx.accounts.fund.key());

    let f = &ctx.accounts.fund;
    let bump = f.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[b"fund", f.manager.as_ref(), f.name.as_bytes(), &[bump]]];

    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        SplApprove {
            to: ctx.accounts.source.to_account_info(),
            delegate: ctx.accounts.manager.to_account_info(),
            authority: f.to_account_info(),
        },
        signer_seeds,
    );
    token::approve(cpi_ctx, amount)?;
    Ok(())
}
