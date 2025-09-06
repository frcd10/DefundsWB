use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::*;

#[derive(Accounts)]
pub struct LiquidatePositionsBatch<'info> {
    #[account(
        mut,
        seeds = [b"withdrawal", fund.key().as_ref(), investor.key().as_ref()],
        bump = withdrawal_state.bump,
        has_one = investor,
        constraint = withdrawal_state.vault == fund.key()
    )]
    pub withdrawal_state: Account<'info, WithdrawalState>,

    #[account(
        seeds = [b"fund", fund.manager.as_ref(), fund.name.as_bytes()],
        bump = fund.bump
    )]
    pub fund: Account<'info, Fund>,

    #[account(mut)]
    pub investor: Signer<'info>,
}

pub fn liquidate_positions_batch(
    ctx: Context<LiquidatePositionsBatch>,
    position_indices: Vec<u8>,
    minimum_amounts_out: Vec<u64>,
) -> Result<()> {
    let withdrawal_state = &mut ctx.accounts.withdrawal_state;

    require!(
        withdrawal_state.status == WithdrawalStatus::Initiated || 
        withdrawal_state.status == WithdrawalStatus::Liquidating,
        FundError::InvalidWithdrawalStatus
    );

    require!(
        position_indices.len() == minimum_amounts_out.len(),
        FundError::InvalidInput
    );

    // Update status to liquidating
    withdrawal_state.status = WithdrawalStatus::Liquidating;

    // For now, simulate liquidation process
    // In a real implementation, this would:
    // 1. Fetch position data for each index
    // 2. Execute Jupiter swaps to convert tokens to SOL
    // 3. Accumulate SOL in withdrawal_state.sol_accumulated
    
    let mock_sol_per_position = 1_000_000; // 0.001 SOL per position (mock)
    let liquidated_positions = position_indices.len() as u8;
    
    withdrawal_state.sol_accumulated += mock_sol_per_position * liquidated_positions as u64;
    withdrawal_state.positions_liquidated += liquidated_positions;

    // Check if all positions are liquidated
    if withdrawal_state.positions_liquidated >= withdrawal_state.total_positions {
        withdrawal_state.status = WithdrawalStatus::ReadyToFinalize;
    }

    msg!(
        "Liquidated {} positions, total SOL accumulated: {}",
        liquidated_positions,
        withdrawal_state.sol_accumulated
    );

    Ok(())
}
