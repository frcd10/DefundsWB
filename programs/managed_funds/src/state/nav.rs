use anchor_lang::prelude::*;

#[account]
pub struct NavAttestation {
    pub fund: Pubkey,
    pub nav_value: u64,      // in base mint base units
    pub expires_at: i64,     // unix timestamp when this attestation expires
    pub updated_at: i64,     // unix timestamp when written
    pub bump: u8,
}

impl NavAttestation {
    pub const SPACE: usize = 8 + 32 + 8 + 8 + 8 + 1;
}
