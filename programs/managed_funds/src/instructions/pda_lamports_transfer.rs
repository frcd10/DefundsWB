use anchor_lang::prelude::*;
use crate::state::Fund;

#[derive(Accounts)]
pub struct PdaLamportsTransfer<'info> {
    #[account(
        mut,
        seeds = [b"fund", fund.manager.as_ref(), fund.name.as_bytes()],
        bump = fund.bump
    )]
    pub fund: Account<'info, Fund>,

    /// CHECK: must be a system-owned account; we only move lamports
    #[account(mut)]
    pub to_system: AccountInfo<'info>,

    /// Manager must sign to authorize lamports movement
    pub manager: Signer<'info>,
}

pub fn pda_lamports_transfer(ctx: Context<PdaLamportsTransfer>, amount: u64) -> Result<()> {
    // Enforce fund manager
    require_keys_eq!(ctx.accounts.manager.key(), ctx.accounts.fund.manager);

    // Move lamports directly; PDA is owned by this program so we can mutate lamports
    let from_info = ctx.accounts.fund.to_account_info();
    let to_info = ctx.accounts.to_system.to_account_info();

    // Ensure destination is system-owned (saves us from accidental sends to program accounts)
    require_keys_eq!(*to_info.owner, System::id());

    // Safety: checked math minimal; rely on runtime to error if insufficient balance
    **from_info.try_borrow_mut_lamports()? = from_info.lamports()
        .checked_sub(amount)
        .ok_or(ErrorCode::InsufficientFunds)?;
    **to_info.try_borrow_mut_lamports()? = to_info.lamports()
        .checked_add(amount)
        .ok_or(ErrorCode::MathOverflow)?;

    Ok(())
}

#[error_code]
pub enum ErrorCode {
    #[msg("Insufficient lamports in fund PDA")] 
    InsufficientFunds,
    #[msg("Arithmetic overflow")] 
    MathOverflow,
}
