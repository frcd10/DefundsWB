use anchor_lang::prelude::*;
use crate::state::*;

#[derive(Accounts)]
pub struct NavAttestWrite<'info> {
    #[account(
        seeds = [b"fund", fund.manager.as_ref(), fund.name.as_bytes()],
        bump = fund.bump
    )]
    pub fund: Account<'info, Fund>,

    #[account(
        init_if_needed,
        payer = payer,
        space = NavAttestation::SPACE,
        seeds = [b"nav", fund.key().as_ref()],
        bump,
    )]
    pub nav_attestation: Account<'info, NavAttestation>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn nav_attest_write(ctx: Context<NavAttestWrite>, nav_value: u64, expires_at: i64) -> Result<()> {
    // Write attestation
    let now = Clock::get()?.unix_timestamp;
    let att = &mut ctx.accounts.nav_attestation;
    att.fund = ctx.accounts.fund.key();
    att.nav_value = nav_value;
    att.expires_at = expires_at;
    att.updated_at = now;
    att.bump = ctx.bumps.nav_attestation;
    Ok(())
}
