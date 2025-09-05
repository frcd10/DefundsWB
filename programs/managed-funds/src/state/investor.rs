use anchor_lang::prelude::*;

#[account]
pub struct InvestorPosition {
    pub investor: Pubkey,         // Investor wallet address
    pub fund: Pubkey,             // Fund they invested in
    pub shares: u64,              // Number of shares owned
    pub initial_investment: u64,  // Initial investment amount
    pub total_deposited: u64,     // Total amount deposited over time
    pub total_withdrawn: u64,     // Total amount withdrawn over time
    pub first_deposit_at: i64,    // Timestamp of first deposit
    pub last_activity_at: i64,    // Timestamp of last activity
}

impl InvestorPosition {
    pub const SPACE: usize = 8 + // discriminator
        32 + // investor
        32 + // fund
        8 + // shares
        8 + // initial_investment
        8 + // total_deposited
        8 + // total_withdrawn
        8 + // first_deposit_at
        8; // last_activity_at

    pub fn current_value(&self, fund_total_assets: u64, fund_total_shares: u64) -> u64 {
        if fund_total_shares == 0 {
            0
        } else {
            (self.shares as u128 * fund_total_assets as u128 / fund_total_shares as u128) as u64
        }
    }

    pub fn unrealized_pnl(&self, fund_total_assets: u64, fund_total_shares: u64) -> i64 {
        let current_value = self.current_value(fund_total_assets, fund_total_shares);
        let total_invested = self.total_deposited - self.total_withdrawn;
        current_value as i64 - total_invested as i64
    }
}
