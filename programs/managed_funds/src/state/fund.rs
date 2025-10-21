use anchor_lang::prelude::*;

#[account]
pub struct Fund {
    pub manager: Pubkey,           // Fund manager/creator
    pub name: String,              // Fund name (max 32 chars)
    pub description: String,       // Fund description (max 100 chars)
    pub base_mint: Pubkey,         // Base token mint (e.g., USDC)
    pub vault: Pubkey,             // Token account holding fund assets
    pub shares_mint: Pubkey,       // Mint for fund shares
    pub management_fee: u16,       // Annual management fee in basis points
    pub performance_fee: u16,      // Performance fee in basis points
    pub total_shares: u64,         // Total shares issued
    pub total_assets: u64,         // Total assets under management
    pub last_fee_collection: i64,  // Last time fees were collected
    pub created_at: i64,           // Fund creation timestamp
    pub bump: u8,                  // Fund PDA bump
    pub vault_bump: u8,            // Vault PDA bump
    pub shares_bump: u8,           // Shares mint PDA bump
}

impl Fund {
    pub const SPACE: usize = 8 + // discriminator
        32 + // manager
        4 + 32 + // name (String with length prefix)
        4 + 100 + // description (String with length prefix)
        32 + // base_mint
        32 + // vault
        32 + // shares_mint
        2 + // management_fee
        2 + // performance_fee
        8 + // total_shares
        8 + // total_assets
        8 + // last_fee_collection
        8 + // created_at
        1 + // bump
        1 + // vault_bump
        1; // shares_bump

    pub fn calculate_shares_to_mint(&self, deposit_amount: u64) -> u64 {
        // Safety: if there are no shares yet OR assets accounting is zero (e.g., after full payout),
        // treat as first deposit to avoid division by zero. This resets price anchor fairly.
        if self.total_shares == 0 || self.total_assets == 0 {
            // First deposit or reset state: 1:1 ratio in base units
            deposit_amount
        } else {
            // Calculate shares based on current share price
            (deposit_amount as u128 * self.total_shares as u128 / self.total_assets as u128) as u64
        }
    }

    pub fn calculate_withdrawal_amount(&self, shares_to_burn: u64) -> u64 {
        if self.total_shares == 0 {
            0
        } else {
            (shares_to_burn as u128 * self.total_assets as u128 / self.total_shares as u128) as u64
        }
    }
}
