use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum TradeType {
    Buy,
    Sell,
}

#[account]
pub struct Trade {
    pub fund: Pubkey,             // Fund that executed the trade
    pub trader: Pubkey,           // Address that executed the trade (should be fund manager)
    pub trade_type: TradeType,    // Buy or Sell
    pub input_mint: Pubkey,       // Input token mint
    pub output_mint: Pubkey,      // Output token mint
    pub amount_in: u64,           // Amount of input tokens
    pub amount_out: u64,          // Amount of output tokens received
    pub timestamp: i64,           // Trade execution timestamp
    pub signature: String,        // Transaction signature for verification
}

impl Trade {
    pub const SPACE: usize = 8 + // discriminator
        32 + // fund
        32 + // trader
        1 + // trade_type
        32 + // input_mint
        32 + // output_mint
        8 + // amount_in
        8 + // amount_out
        8 + // timestamp
        4 + 88; // signature (String with length prefix, max 88 chars for tx sig)
}
