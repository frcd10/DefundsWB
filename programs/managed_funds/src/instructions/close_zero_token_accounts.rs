use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount};
use anchor_spl::token::spl_token as spl_token;
use anchor_lang::solana_program::program_pack::Pack;

use crate::state::Fund as FundState;

// Closes all provided zero-balance SPL token accounts owned by the Fund PDA.
// The lamports recovered from closing accounts are sent to `fund_wsol_ata`.
// If `fund_wsol_ata` is a native (WSOL) token account, this also issues a SyncNative
// so the token amount reflects the added lamports.
//
// Pass any number of token accounts to close in `remaining_accounts`.
// Safety checks:
// - Skips accounts that are not owned by the SPL token program
// - Skips accounts whose owner is not the Fund PDA
// - Skips accounts with non-zero amount
// - Skips if the account matches `fund_wsol_ata`
pub fn close_zero_token_accounts<'info>(ctx: Context<'_, '_, '_, 'info, CloseZeroTokenAccounts<'info>>) -> Result<()> {
    let fund = &ctx.accounts.fund;
    let _token_program = &ctx.accounts.token_program;
    let fund_wsol_ata = &ctx.accounts.fund_wsol_ata;

    let mut closed_any = false;

    for acc_info in ctx.remaining_accounts.iter() {
        // Only process token accounts
        if acc_info.owner != &token::ID {
            continue;
        }

        // Skip destination/self
        if *acc_info.key == fund_wsol_ata.key() {
            continue;
        }

        // Parse token account
        let data = acc_info.try_borrow_data()?;
        // spl_token state Account unpack; use the re-exported spl_token from anchor_spl
        let ta = match spl_token::state::Account::unpack(&data) {
            Ok(a) => a,
            Err(_) => continue,
        };

        // Must be owned by Fund PDA and zero balance
        if ta.owner != fund.key() || ta.amount != 0 {
            continue;
        }

        drop(data); // release borrow before CPI

        // Build and invoke close_account instruction
        let ix = spl_token::instruction::close_account(
            &token::ID,
            acc_info.key,
            &fund_wsol_ata.key(),
            &fund.key(),
            &[],
        )?;

        let signer_seeds: &[&[u8]] = &[b"fund", fund.manager.as_ref(), fund.name.as_bytes(), &[fund.bump]];
        anchor_lang::solana_program::program::invoke_signed(
            &ix,
            &[
                acc_info.clone(),
                fund_wsol_ata.to_account_info(),
                fund.to_account_info(),
                // token program is the program id, not an account for this CPI
            ],
            &[signer_seeds],
        )?;
        closed_any = true;
    }

    // If destination is native mint ATA, sync native so token amount reflects added lamports
    if closed_any {
        // We need to ensure this is a native mint account before syncing; read mint from account data
        let dest_ai = fund_wsol_ata.to_account_info();
        let dest_data = dest_ai.try_borrow_data()?;
        if let Ok(dest_ta) = spl_token::state::Account::unpack(&dest_data) {
            if dest_ta.mint == spl_token::native_mint::id() {
                drop(dest_data);
                let ix_sync = spl_token::instruction::sync_native(&token::ID, &fund_wsol_ata.key())?;
                anchor_lang::solana_program::program::invoke(
                    &ix_sync,
                    &[dest_ai],
                )?;
            }
        }
    }

    Ok(())
}

#[derive(Accounts)]
pub struct CloseZeroTokenAccounts<'info> {
    #[account(mut, seeds = [b"fund", fund.manager.as_ref(), fund.name.as_bytes()], bump = fund.bump)]
    pub fund: Account<'info, FundState>,
    /// Destination for recovered lamports; typically the Fund's WSOL ATA
    #[account(mut)]
    pub fund_wsol_ata: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}
