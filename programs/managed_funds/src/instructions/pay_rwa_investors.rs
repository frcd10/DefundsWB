use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct PayRwaInvestors<'info> {
	/// Manager must authorize payouts (matches current client flow; funds come from manager wallet)
	#[account(mut)]
	pub manager: Signer<'info>,

	/// System program for lamports transfer CPI
	pub system_program: Program<'info, System>,
}

// Logic resides in program entrypoint to simplify lifetimes
// helper removed; logic is in #[program] entrypoint

