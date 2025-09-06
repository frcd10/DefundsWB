use anchor_lang::prelude::*;

#[error_code]
pub enum FundError {
    #[msg("Unauthorized: Only fund manager can perform this action")]
    Unauthorized,
    
    #[msg("Invalid fee: Fee exceeds maximum allowed")]
    InvalidFee,
    
    #[msg("Insufficient funds in vault")]
    InsufficientFunds,
    
    #[msg("Invalid amount: Amount must be greater than zero")]
    InvalidAmount,
    
    #[msg("Invalid shares: Shares amount is invalid")]
    InvalidShares,
    
    #[msg("Fund is paused")]
    FundPaused,
    
    #[msg("Invalid mint: Token mint is not supported")]
    InvalidMint,
    
    #[msg("Slippage exceeded: Minimum amount out not met")]
    SlippageExceeded,
    
    #[msg("Trade failed: External trade execution failed")]
    TradeFailed,
    
    #[msg("Math overflow")]
    MathOverflow,
    
    #[msg("Invalid withdrawal status")]
    InvalidWithdrawalStatus,
    
    #[msg("Invalid input parameters")]
    InvalidInput,
}
