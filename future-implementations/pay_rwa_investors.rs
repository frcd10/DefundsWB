// Archived for future use. On-chain batched SOL payouts from a manager signer.
// Original location: programs/managed_funds/src/instructions/pay_rwa_investors.rs and #[program] entrypoint.

use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct PayRwaInvestors<'info> {
	/// Manager must authorize payouts (matches current client flow; funds come from manager wallet)
	#[account(mut)]
	pub manager: Signer<'info>,

	/// System program for lamports transfer CPI
	pub system_program: Program<'info, System>,
}

pub fn pay_rwa_investors<'info>(
    ctx: Context<'_, '_, '_, 'info, PayRwaInvestors<'info>>,
    amounts: Vec<u64>,
) -> Result<()> {
    require!(!amounts.is_empty(), CustomError::InvalidInput);
    require!(ctx.remaining_accounts.len() == amounts.len(), CustomError::InvalidInput);

    for (i, recipient_ai) in ctx.remaining_accounts.iter().enumerate() {
        let amount = amounts[i];
        if amount == 0 { continue; }

        let from_ai = ctx.accounts.manager.to_account_info();
        let to_ai = recipient_ai.clone();
        let program_ai = ctx.accounts.system_program.to_account_info();

        let cpi_accounts = anchor_lang::system_program::Transfer { from: from_ai, to: to_ai };
        let cpi_ctx = anchor_lang::prelude::CpiContext::new(program_ai, cpi_accounts);
        anchor_lang::system_program::transfer(cpi_ctx, amount)?;
    }

    Ok(())
}

#[error_code]
pub enum CustomError {
    #[msg("invalid input")] InvalidInput,
}
