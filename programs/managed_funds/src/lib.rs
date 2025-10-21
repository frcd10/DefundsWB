#![allow(ambiguous_glob_reexports)]
use anchor_lang::prelude::*;

pub mod instructions;
pub mod state;
pub mod errors;

// Re-export context/account types so Anchor can find them at crate root
pub use instructions::*;

declare_id!("DEFuNDoMVQ8TnYjDM95bJK55Myr5dmwor43xboG2XQYd");

// Gated logging: use `log!()` instead of `msg!()`. Enable via `--features onchain-logs`.
#[cfg(feature = "onchain-logs")]
#[macro_export]
macro_rules! log {
    ($($arg:tt)*) => { anchor_lang::prelude::msg!($($arg)*); };
}

#[cfg(not(feature = "onchain-logs"))]
#[macro_export]
macro_rules! log {
    ($($arg:tt)*) => {};
}

#[program]
pub mod managed_funds {
    use super::*;

    /// Initialize a new fund vault
    pub fn initialize_fund(
        ctx: Context<InitializeFund>,
        name: String,
        description: String,
        management_fee: u16, // basis points (100 = 1%)
        performance_fee: u16, // basis points
    ) -> Result<()> {
        instructions::initialize_fund(ctx, name, description, management_fee, performance_fee)
    }

    /// Deposit into a fund
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        instructions::deposit(ctx, amount)
    }

    // Removed legacy withdraw, execute_trade, and update_fund instructions (unused in production)

    /// Initiate a withdrawal with position liquidation
    pub fn initiate_withdrawal(
        ctx: Context<InitiateWithdrawal>,
        shares_to_withdraw: u64,
    ) -> Result<()> {
        instructions::initiate_withdrawal(ctx, shares_to_withdraw)
    }

    /// Finalize withdrawal and distribute SOL
    pub fn finalize_withdrawal(ctx: Context<FinalizeWithdrawal>) -> Result<()> {
        instructions::finalize_withdrawal(ctx)
    }

    // Removed pay_rwa_investors (deferred for future implementation)

    /// Distribute SOL from vault to investors by share percentage, taking platform and performance fees.
    pub fn pay_fund_investors<'info>(
        ctx: Context<'_, '_, 'info, 'info, PayFundInvestors<'info>>,
        total_amount: u64,
    ) -> Result<()> {
        instructions::pay_fund_investors(ctx, total_amount)
    }

    // Removed debug_vault (no longer needed in production)
    // Removed investor_fund_withdrawal and swap authorize/revoke (unused in production)

    // Removed ping_build (no longer needed)

    /// Shared accounts model swap (program-owned vaults) via Jupiter
    // removed swap_tokens_shared

    /// Initialize vault PDA used by the standalone vault-based Jupiter CPI path
    pub fn initialize_vault(ctx: Context<InitializeVault>) -> Result<()> {
        instructions::initialize_vault(ctx)
    }

    /// Forward Jupiter router instruction using vault PDA as program authority signer
    pub fn token_swap_vault<'info>(
        ctx: Context<'_, '_, 'info, 'info, TokenSwapVault<'info>>,
        data: Vec<u8>,
        tmp: Vec<u8>,
    ) -> Result<()> {
        instructions::token_swap_vault(ctx, data, tmp)
    }

    // removed: liquidate_positions_batch (deleted)
    // removed: withdraw_swap_router (deleted)

    /// Investor-only: forward a single Jupiter router swap for withdrawals.
    pub fn withdraw_swap_instruction<'info>(
        ctx: Context<'_, '_, 'info, 'info, WithdrawSwapInstruction<'info>>,
        router_data: Vec<u8>,
        in_amount: u64,
        out_min_amount: u64,
    ) -> Result<()> {
        instructions::withdraw_swap_instruction(ctx, router_data, in_amount, out_min_amount)
    }

    /// Close the Fund's WSOL ATA and return lamports to the Fund PDA (unwrap)
    pub fn unwrap_wsol_fund(ctx: Context<UnwrapWsolFund>) -> Result<()> {
        instructions::unwrap_wsol_fund(ctx)
    }

    /// Re-create the SPL vault TokenAccount PDA if it was closed
    pub fn repair_vault(ctx: Context<RepairVault>) -> Result<()> {
        instructions::repair_vault(ctx)
    }

    /// Transfer SPL tokens between Fund PDA-owned token accounts (same mint)
    pub fn pda_token_transfer(
        ctx: Context<PdaTokenTransfer>,
        amount: u64,
    ) -> Result<()> {
        instructions::pda_token_transfer(ctx, amount)
    }

    /// Move lamports from the Fund PDA to a system account (manager-controlled)
    pub fn pda_lamports_transfer(
        ctx: Context<PdaLamportsTransfer>,
        amount: u64,
    ) -> Result<()> {
        instructions::pda_lamports_transfer(ctx, amount)
    }

    /// Approve manager as delegate on a Fund-owned token account for a given amount
    pub fn pda_token_approve(
        ctx: Context<PdaTokenApprove>,
        amount: u64,
    ) -> Result<()> {
        instructions::pda_token_approve(ctx, amount)
    }

    /// Revoke any delegate on a Fund-owned token account
    pub fn pda_token_revoke(
        ctx: Context<PdaTokenRevoke>,
    ) -> Result<()> {
        instructions::pda_token_revoke(ctx)
    }

    /// One-time: set the NAV attestor for this fund (manager only)
    /// Investor-provided NAV attestation write (uses configured attestor key)
    pub fn nav_attest_write(ctx: Context<NavAttestWrite>, nav_value: u64, expires_at: i64) -> Result<()> {
        instructions::nav_attest_write(ctx, nav_value, expires_at)
    }

    /// Close any number of zero-balance Fund-owned SPL token accounts and send lamports to the Fund WSOL ATA
    pub fn close_zero_token_accounts<'info>(ctx: Context<'_, '_, 'info, 'info, CloseZeroTokenAccounts<'info>>) -> Result<()> {
        instructions::close_zero_token_accounts(ctx)
    }
}
