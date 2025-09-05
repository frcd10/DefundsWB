use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

pub mod instructions;
pub mod state;
pub mod errors;

pub use instructions::*;
pub use state::*;
pub use errors::*;

declare_id!("tNo3sxFi51AhRzQ3zuSfQVBusNpPRyNrec5LA4xdDom");

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
}
