use anchor_lang::prelude::*;

#[error_code]
pub enum FundError {
    #[msg("Er fee")]
    InvalidFee,
    
    #[msg("Er funds")]
    InsufficientFunds,
    
    #[msg("Er amount")]
    InvalidAmount,
    
    #[msg("Er shares")]
    InvalidShares,
    
    #[msg("Er mint")]
    InvalidMint,
    
    #[msg("Math Er")]
    MathOverflow,
    
    #[msg("Slp excd")]
    SlippageExceeded,
    
    #[msg("Er withdrawal status")]
    InvalidWithdrawalStatus,
    
    #[msg("Er input")]
    InvalidInput,

    #[msg("Inv Er")]
    InvocationFailed,
}
