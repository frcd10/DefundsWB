use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::*;

#[derive(Accounts)]
#[instruction(name: Option<String>)]
pub struct UpdateFund<'info> {
    #[account(
        mut,
        seeds = [b"fund", fund.manager.as_ref(), fund.name.as_bytes()],
        bump = fund.bump,
        has_one = manager
    )]
    pub fund: Account<'info, Fund>,

    pub manager: Signer<'info>,
}

pub fn update_fund(
    ctx: Context<UpdateFund>,
    name: Option<String>,
    description: Option<String>,
    management_fee: Option<u16>,
    performance_fee: Option<u16>,
) -> Result<()> {
    let fund = &mut ctx.accounts.fund;

    // Update name if provided
    if let Some(new_name) = name {
        require!(new_name.len() <= 50, FundError::InvalidAmount);
        fund.name = new_name;
    }

    // Update description if provided
    if let Some(new_description) = description {
        require!(new_description.len() <= 200, FundError::InvalidAmount);
        fund.description = new_description;
    }

    // Update management fee if provided
    if let Some(new_management_fee) = management_fee {
        require!(new_management_fee <= 500, FundError::InvalidFee); // Max 5%
        fund.management_fee = new_management_fee;
    }

    // Update performance fee if provided
    if let Some(new_performance_fee) = performance_fee {
        require!(new_performance_fee <= 2000, FundError::InvalidFee); // Max 20%
        fund.performance_fee = new_performance_fee;
    }

    msg!(
        "Fund '{}' updated by manager: {}",
        fund.name,
        fund.manager
    );

    Ok(())
}
