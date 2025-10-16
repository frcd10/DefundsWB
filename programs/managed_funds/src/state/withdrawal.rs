use anchor_lang::prelude::*;

#[account]
pub struct WithdrawalState {
    pub investor: Pubkey,          // Investor requesting withdrawal
    pub vault: Pubkey,             // Fund vault
    pub shares_to_withdraw: u64,   // Number of shares to withdraw
    pub total_shares_snapshot: u64, // Snapshot of total shares at initiation
    pub fraction_bps: u32,         // Proportional fraction in parts-per-million (1e6 basis)
    pub wsol_unwrapped: u64,       // WSOL already unwrapped into SOL for this withdrawal
    pub positions_liquidated: u8,  // Number of positions already liquidated
    pub total_positions: u8,       // Total positions to liquidate
    pub sol_accumulated: u64,      // SOL accumulated from liquidations
    pub status: WithdrawalStatus,  // Current status
    pub created_at: i64,           // Withdrawal request timestamp
    pub bump: u8,                  // PDA bump
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum WithdrawalStatus {
    Initiated,
    Liquidating,
    ReadyToFinalize,
    Completed,
    Failed,
}

impl WithdrawalState {
    pub const SPACE: usize = 8 + // discriminator
        32 + // investor
        32 + // vault
        8 + // shares_to_withdraw
    8 + // total_shares_snapshot
    4 + // fraction_bps
    8 + // wsol_unwrapped
        1 + // positions_liquidated
        1 + // total_positions
        8 + // sol_accumulated
        1 + // status
        8 + // created_at
        1; // bump
}

#[account]
pub struct VaultPosition {
    pub vault: Pubkey,        // Fund vault
    pub mint: Pubkey,         // Token mint
    pub amount: u64,          // Amount held
    pub created_at: i64,      // Position creation timestamp
    pub last_updated: i64,    // Last update timestamp
    pub bump: u8,             // PDA bump
}

impl VaultPosition {
    pub const SPACE: usize = 8 + // discriminator
        32 + // vault
        32 + // mint
        8 + // amount
        8 + // created_at
        8 + // last_updated
        1; // bump
}

#[account]
pub struct WithdrawalMintProgress {
    pub withdrawal: Pubkey,     // WithdrawalState key
    pub mint: Pubkey,           // Token mint being liquidated
    pub amount_liquidated: u64, // Total input amount liquidated so far (in mint base units)
    pub bump: u8,               // PDA bump
}

impl WithdrawalMintProgress {
    pub const SPACE: usize = 8 + // discriminator
        32 + // withdrawal
        32 + // mint
        8 +  // amount_liquidated
        1;   // bump
}
