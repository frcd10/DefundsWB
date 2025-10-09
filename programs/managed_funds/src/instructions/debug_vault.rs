use anchor_lang::prelude::*;
use anchor_spl::token::{Token, Mint};
use crate::state::*;

#[derive(Accounts)]
pub struct DebugVault<'info> {
    #[account(mut)]
    pub manager: Signer<'info>,
    #[account(
        mut,
        seeds = [b"fund", fund.manager.as_ref(), fund.name.as_bytes()],
        bump = fund.bump,
        has_one = manager,
    )]
    pub fund: Account<'info, Fund>,
    /// Vault PDA (may or may not be a valid token account)
    #[account(
        mut,
        seeds = [b"vault", fund.key().as_ref()],
        bump = fund.vault_bump,
    )]
    /// CHECK: we want to inspect raw owner & data even if not a valid token account
    pub vault: AccountInfo<'info>,
    /// Base mint for context
    pub base_mint: Account<'info, Mint>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn debug_vault(ctx: Context<DebugVault>) -> Result<()> {
    let vault_ai = &ctx.accounts.vault;
    // Copy the owner pubkey so comparisons work without needing references
    let owner = *vault_ai.owner;
    let lamports = vault_ai.lamports();
    let data_len = vault_ai.data_len();
    log!("[debug_vault] vault pubkey: {}", vault_ai.key());
    log!("[debug_vault] owner: {}", owner);
    log!("[debug_vault] lamports: {} data_len: {}", lamports, data_len);
    // Try token decode
    if owner == anchor_spl::token::ID {
        if data_len == 165 {
            if let Ok(token_acc) = anchor_spl::token::TokenAccount::try_deserialize(&mut &**vault_ai.data.borrow()) {
                log!("[debug_vault] token.mint: {} token.owner: {} amount: {}", token_acc.mint, token_acc.owner, token_acc.amount);
            } else {
                log!("[debug_vault] failed to deserialize token account despite owner match");
            }
        } else {
            log!("[debug_vault] owner is token program but unexpected size {}", data_len);
        }
    } else {
        log!("[debug_vault] owner is NOT token program (expected {}), raw first 8 bytes (hex):", anchor_spl::token::ID);
        let slice = &vault_ai.data.borrow();
        let preview: Vec<String> = slice.iter().take(8).map(|b| format!("{:02x}", b)).collect();
        log!("[debug_vault] data preview: {}", preview.join(""));
    }
    Ok(())
}
