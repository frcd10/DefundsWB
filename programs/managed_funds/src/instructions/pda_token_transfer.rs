use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer as SplTransfer};
use crate::state::Fund;

#[derive(Accounts)]
pub struct PdaTokenTransfer<'info> {
    #[account(
        mut,
        seeds = [b"fund", fund.manager.as_ref(), fund.name.as_bytes()],
        bump = fund.bump
    )]
    pub fund: Account<'info, Fund>,

    #[account(mut)]
    pub from: Account<'info, TokenAccount>,

    #[account(mut)]
    pub to: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,

    // Enforce only the fund manager can trigger transfers
    pub manager: Signer<'info>,
}

pub fn pda_token_transfer(ctx: Context<PdaTokenTransfer>, amount: u64) -> Result<()> {
    // Require manager signer to match fund.manager
    require_keys_eq!(ctx.accounts.manager.key(), ctx.accounts.fund.manager);
    // Validate both accounts are owned by the fund PDA and have the same mint
    require_keys_eq!(ctx.accounts.from.owner, ctx.accounts.fund.key());
    require_keys_eq!(ctx.accounts.to.owner, ctx.accounts.fund.key());
    require_keys_eq!(ctx.accounts.from.mint, ctx.accounts.to.mint);

    let f = &ctx.accounts.fund;
    let bump = f.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[b"fund", f.manager.as_ref(), f.name.as_bytes(), &[bump]]];

    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        SplTransfer {
            from: ctx.accounts.from.to_account_info(),
            to: ctx.accounts.to.to_account_info(),
            authority: f.to_account_info(),
        },
        signer_seeds,
    );

    token::transfer(cpi_ctx, amount)?;
    Ok(())
}
