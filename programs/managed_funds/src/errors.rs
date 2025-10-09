use anchor_lang::prelude::*;

#[error_code]
pub enum FundError {
    #[msg("Invalid fee")]
    InvalidFee,
    
    #[msg("Insufficient funds")]
    InsufficientFunds,
    
    #[msg("Invalid amount")]
    InvalidAmount,
    
    #[msg("Invalid shares")]
    InvalidShares,
    
    #[msg("Invalid mint")]
    InvalidMint,
    
    #[msg("Math overflow")]
    MathOverflow,
    
    #[msg("Slippage exceeded")]
    SlippageExceeded,
    
    #[msg("Invalid withdrawal status")]
    InvalidWithdrawalStatus,
    
    #[msg("Invalid input")]
    InvalidInput,
}
