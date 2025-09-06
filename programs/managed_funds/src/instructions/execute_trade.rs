use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};
use crate::state::*;
use crate::errors::*;

#[derive(Accounts)]
#[instruction(input_mint: Pubkey, output_mint: Pubkey, amount_in: u64, minimum_amount_out: u64)]
pub struct ExecuteTrade<'info> {
    #[account(
        mut,
        seeds = [b"fund", fund.manager.as_ref(), fund.name.as_bytes()],
        bump = fund.bump,
        has_one = manager
    )]
    pub fund: Account<'info, Fund>,

    #[account(
        mut,
        seeds = [b"vault", fund.key().as_ref()],
        bump = fund.vault_bump,
        token::authority = fund
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = manager,
        space = Trade::SPACE,
        seeds = [b"trade", fund.key().as_ref(), input_mint.as_ref(), output_mint.as_ref()],
        bump
    )]
    pub trade: Account<'info, Trade>,

    #[account(mut)]
    pub manager: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

pub fn execute_trade(
    ctx: Context<ExecuteTrade>,
    input_mint: Pubkey,
    output_mint: Pubkey,
    amount_in: u64,
    minimum_amount_out: u64,
) -> Result<()> {
    require!(amount_in > 0, FundError::InvalidAmount);
    require!(minimum_amount_out > 0, FundError::InvalidAmount);

    let fund = &ctx.accounts.fund;
    let trade = &mut ctx.accounts.trade;
    let clock = Clock::get()?;

    // For now, we'll implement basic validation
    // In production, this would include Jupiter integration
    require!(
        input_mint == fund.base_mint || output_mint == fund.base_mint,
        FundError::InvalidMint
    );

    // Record trade before execution
    trade.fund = fund.key();
    trade.trader = ctx.accounts.manager.key();
    trade.trade_type = if input_mint == fund.base_mint {
        TradeType::Sell
    } else {
        TradeType::Buy
    };
    trade.input_mint = input_mint;
    trade.output_mint = output_mint;
    trade.amount_in = amount_in;
    trade.timestamp = clock.unix_timestamp;

    // TODO: Implement Jupiter CPI integration
    // For now, we'll simulate a successful trade
    let simulated_amount_out = minimum_amount_out;
    trade.amount_out = simulated_amount_out;

    // Get transaction signature for audit trail
    let tx_signature = ctx.accounts.manager.to_account_info().key().to_string();
    trade.signature = tx_signature[..std::cmp::min(tx_signature.len(), 88)].to_string();

    msg!(
        "Trade recorded for fund '{}': {} {} -> {} {}",
        fund.name,
        amount_in,
        input_mint,
        simulated_amount_out,
        output_mint
    );

    Ok(())
}
