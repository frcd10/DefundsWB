use anchor_lang::prelude::*;
use anchor_lang::solana_program::{instruction::Instruction, program::invoke_signed};
use anchor_spl::token::Token;
use crate::state::Fund;
use std::str::FromStr;

// Standalone vault-based CPI to Jupiter, mirroring the provided example as closely as possible.

pub const VAULT_SOL_SEED: &[u8] = b"vault_sol"; // retained for other flows; not used as signer here

// Jupiter Aggregator v6 program id
pub const JUPITER_PROGRAM_ID: &str = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    /// CHECK: unused (kept for backward compatibility)
    #[account(mut)]
    pub vault: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct TokenSwapVault<'info> {
    #[account(
        mut,
        seeds = [b"fund", fund.manager.as_ref(), fund.name.as_bytes()],
        bump = fund.bump
    )]
    pub fund: Account<'info, Fund>,

    /// CHECK: Jupiter router program id; validated at runtime
    pub jupiter_program: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

// Initialize the vault by transferring minimum lamports to make it rent-exempt (0 data length account not needed,
// but we keep the example behavior by doing a noop transfer if desired).
pub fn initialize_vault(_ctx: Context<InitializeVault>) -> Result<()> {
    // Example code transferred lamports; in Anchor, PDA without data is not a system account, so a transfer
    // directly to PDA is fine but not necessary. We keep this instruction as a placeholder initializer.
    Ok(())
}

// Forward a Jupiter router instruction using remaining_accounts and vault PDA as the program authority signer.
pub fn token_swap_vault<'info>(
    ctx: Context<'_, '_, 'info, 'info, TokenSwapVault<'info>>,
    data: Vec<u8>,
    _tmp: Vec<u8>, // kept for parity with example; logged or ignored
) -> Result<()> {
    // Optional: validate first 8 bytes correspond to a Jupiter router discriminator
    // We skip strict validation to keep this generic pass-through per example.

    // Ensure we are calling the expected Jupiter program id
    let expected = Pubkey::from_str(JUPITER_PROGRAM_ID)
        .map_err(|_| error!(anchor_lang::error::ErrorCode::ConstraintSeeds))?;
    require_keys_eq!(ctx.accounts.jupiter_program.key(), expected);

    // Build AccountMeta list from remaining_accounts and mark the fund PDA (user) as is_signer
    let user_key = ctx.accounts.fund.key();
    // Debug: ensure the user key is actually present in remaining_accounts in the expected Jupiter router list
    let mut user_present = false;
    let mut user_index: i32 = -1;
    for (i, acc) in ctx.remaining_accounts.iter().enumerate() {
        if acc.key == &user_key {
            user_present = true;
            user_index = i as i32;
            break;
        }
    }
    if !user_present {
        // Log minimal info to help diagnose account ordering issues
        msg!("token_swap_vault: user (fund) not in remaining_accounts; remaining len {}", ctx.remaining_accounts.len());
    } else {
        msg!("token_swap_vault: user found in remaining_accounts at index {}", user_index);
    }
    let mut metas: Vec<anchor_lang::solana_program::instruction::AccountMeta> = ctx
        .remaining_accounts
        .iter()
        .map(|acc| anchor_lang::solana_program::instruction::AccountMeta {
            pubkey: *acc.key,
            is_signer: if acc.key == &user_key { true } else { acc.is_signer },
            is_writable: acc.is_writable,
        })
        .collect();

    // Also ensure user transfer authority (if present) can be a signer; outer signature will suffice.
    // We don't modify others, keeping parity with example.

    let infos: Vec<AccountInfo> = ctx.remaining_accounts.iter().map(|acc| acc.to_account_info()).collect();

    // Fund PDA signer seeds (owner/authority of program-owned token accounts)
    let f = &ctx.accounts.fund;
    let bump = f.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[b"fund", f.manager.as_ref(), f.name.as_bytes(), &[bump]]];

    let ix = Instruction {
        program_id: ctx.accounts.jupiter_program.key(),
        accounts: metas.drain(..).collect(),
        data,
    };

    invoke_signed(&ix, &infos, signer_seeds)
        .map_err(|_| error!(anchor_lang::error::ErrorCode::ConstraintRaw))?;

    Ok(())
}
