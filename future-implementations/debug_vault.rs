// Archived for future use. On-chain debug helper to print vault state.
// Original location: programs/managed_funds/src/instructions/debug_vault.rs and #[program] entrypoint.

use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct DebugVault<'info> {
    pub manager: Signer<'info>,
    /// CHECK: vault account inspected in program logs only
    #[account(mut)]
    pub fund: AccountInfo<'info>,
    /// CHECK: token account or system account
    pub vault: AccountInfo<'info>,
    /// CHECK: mint (optional)
    pub base_mint: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
    /// CHECK: token program
    pub token_program: AccountInfo<'info>,
}

pub fn debug_vault(_ctx: Context<DebugVault>) -> Result<()> {
    // omitted
    Ok(())
}
