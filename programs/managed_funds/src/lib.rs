use anchor_lang::prelude::*;

pub mod instructions;
pub mod state;
pub mod errors;

pub use instructions::*;
pub use state::*;
pub use errors::*;

declare_id!("3dHDaKpa5aLMwimWJeBihqwQyyHpR6ky7NNDPtv7QFYt");

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

    /// Withdraw from a fund
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        instructions::withdraw(ctx, amount)
    }

    /// Execute a trade (only fund manager)
    pub fn execute_trade(
        ctx: Context<ExecuteTrade>,
        input_mint: Pubkey,
        output_mint: Pubkey,
        amount_in: u64,
        minimum_amount_out: u64,
    ) -> Result<()> {
        instructions::execute_trade(ctx, input_mint, output_mint, amount_in, minimum_amount_out)
    }

    /// Update fund settings (only fund manager)
    pub fn update_fund(
        ctx: Context<UpdateFund>,
        name: Option<String>,
        description: Option<String>,
        management_fee: Option<u16>,
        performance_fee: Option<u16>,
    ) -> Result<()> {
        instructions::update_fund(ctx, name, description, management_fee, performance_fee)
    }

    /// Initiate a withdrawal with position liquidation
    pub fn initiate_withdrawal(
        ctx: Context<InitiateWithdrawal>,
        shares_to_withdraw: u64,
    ) -> Result<()> {
        instructions::initiate_withdrawal(ctx, shares_to_withdraw)
    }

    /// Liquidate positions in batches during withdrawal
    pub fn liquidate_positions_batch(
        ctx: Context<LiquidatePositionsBatch>,
        position_indices: Vec<u8>,
        minimum_amounts_out: Vec<u64>,
    ) -> Result<()> {
        instructions::liquidate_positions_batch(ctx, position_indices, minimum_amounts_out)
    }

    /// Finalize withdrawal and distribute SOL
    pub fn finalize_withdrawal(ctx: Context<FinalizeWithdrawal>) -> Result<()> {
        instructions::finalize_withdrawal(ctx)
    }

    /// Pay RWA investors with a single CPI fan-out from manager signer
    pub fn pay_rwa_investors<'info>(
        ctx: Context<'_, '_, '_, 'info, PayRwaInvestors<'info>>,
        amounts: Vec<u64>,
    ) -> Result<()> {
        require!(!amounts.is_empty(), errors::FundError::InvalidInput);
        require!(ctx.remaining_accounts.len() == amounts.len(), errors::FundError::InvalidInput);

        for (i, recipient_ai) in ctx.remaining_accounts.iter().enumerate() {
            let amount = amounts[i];
            if amount == 0 { continue; }

            let from_ai = ctx.accounts.manager.to_account_info();
            let to_ai = recipient_ai.clone();
            let program_ai = ctx.accounts.system_program.to_account_info();

            let cpi_accounts = anchor_lang::system_program::Transfer { from: from_ai, to: to_ai };
            let cpi_ctx = anchor_lang::prelude::CpiContext::new(program_ai, cpi_accounts);
            anchor_lang::system_program::transfer(cpi_ctx, amount)?;
        }

        Ok(())
    }
}
