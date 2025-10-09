use anchor_lang::{prelude::*, solana_program::{instruction::Instruction, program::invoke_signed, instruction::AccountMeta, program_pack::Pack}};
use anchor_spl::token::Token;
use anchor_spl::token::spl_token::state::Account as SplTokenAccount;
use anchor_spl::token_2022::spl_token_2022::state::Account as SplToken2022Account;
use crate::{state::*, errors::FundError};

#[derive(Accounts)]
pub struct DefundSwap<'info> {
    // Fund and authority
    #[account(
        mut,
        seeds = [b"fund", fund.manager.as_ref(), fund.name.as_bytes()],
        bump = fund.bump,
        has_one = manager,
    )]
    pub fund: Account<'info, Fund>,

    /// Manager signs to authorize swaps
    pub manager: Signer<'info>,

    /// CHECK: Destination account expected to receive output tokens or SOL.
    /// If SPL token, must be a TokenAccount owned by token program; if SOL, a system account.
    #[account(mut)]
    pub destination_account: AccountInfo<'info>,

    /// CHECK: Jupiter router program id
    pub jupiter_program: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

struct ParsedTokenAccount {
    owner: Pubkey,
    mint: Pubkey,
    amount: u64,
}

fn unpack_token_account(ai: &AccountInfo) -> Option<ParsedTokenAccount> {
    let data = ai.try_borrow_data().ok()?;
    if ai.owner == &anchor_spl::token::ID {
        let ta = SplTokenAccount::unpack_from_slice(&data).ok()?;
        Some(ParsedTokenAccount { owner: ta.owner, mint: ta.mint, amount: ta.amount })
    } else if ai.owner == &anchor_spl::token_2022::ID {
        let ta = SplToken2022Account::unpack_from_slice(&data).ok()?;
        Some(ParsedTokenAccount { owner: ta.owner, mint: ta.mint, amount: ta.amount })
    } else {
        None
    }
}

fn read_token_amount(ai: &AccountInfo) -> Option<u64> {
    unpack_token_account(ai).map(|ta| ta.amount)
}

pub fn defund_swap(
    ctx: Context<DefundSwap>,
    _amount_in: u64,
    minimum_amount_out: u64,
    output_mint: Pubkey,
    route_data: Vec<u8>,
) -> Result<()> {
    require!(minimum_amount_out > 0, FundError::InvalidAmount);

    // Optional on-chain allowlists (populate to enforce). Guarded behind `anchor-debug` feature to avoid permanent bloat.
    #[cfg(feature = "anchor-debug")]
    const JUP_ALLOWED: &[Pubkey] = &[
        // Jupiter Router v6 mainnet (example; verify latest official address)
        pubkey!("JUP6LkbZbjS9J9Q3rroWAtxEvsCzorBpPg7DwL2H6bK"),
    ];
    #[cfg(not(feature = "anchor-debug"))]
    const JUP_ALLOWED: &[Pubkey] = &[];

    #[cfg(feature = "anchor-debug")]
    const DEX_ALLOWED: &[Pubkey] = &[
        // Raydium AMM/CP/CL/sys program IDs (examples)
        pubkey!("RVKd61ztZW9vGJ8rYkRZHYEGQGvE9zraFMvxhYkBJ3u"),
        pubkey!("whirLbMiicVdio4Br9GqY1CtCybYxQteA94ppw9u3x2"), // Whirlpool
        pubkey!("srmqPvGLw7YT1Do1B4ezgm6CvK1nTRo6G2HvtCb4VwL"), // OpenBook v2 (example)
    ];
    #[cfg(not(feature = "anchor-debug"))]
    const DEX_ALLOWED: &[Pubkey] = &[];

    // Enforce Jupiter router allowlist if provided
    if !JUP_ALLOWED.is_empty() {
        require!(JUP_ALLOWED.contains(&ctx.accounts.jupiter_program.key()), FundError::InvalidInput);
    }

    // Validate destination account ownership and mint if it's a token account
    // If destination is a token account, owner must be fund and mint must equal output_mint
    if let Some(ta) = unpack_token_account(&ctx.accounts.destination_account) {
        require_keys_eq!(ta.owner, ctx.accounts.fund.key(), FundError::InvalidInput);
        require_keys_eq!(ta.mint, output_mint, FundError::InvalidMint);
    } else {
        // Not a token account; treat as SOL account. For SOL, we expect destination to be owned by System.
        // No strict enforcement here; programs may route native SOL unwrap to system accounts.
        // Add checks here if you maintain a vault SOL PDA destination.
    }

    // Pre-snapshot destination balance (supports SPL token or SOL via lamports)
    let pre_amount = if let Some(a) = read_token_amount(&ctx.accounts.destination_account) {
        a
    } else {
        ctx.accounts.destination_account.lamports()
    };

    // Build account metas mirroring remaining_accounts order
    let mut metas: Vec<AccountMeta> = Vec::with_capacity(ctx.remaining_accounts.len());
    for ai in ctx.remaining_accounts.iter() {
        metas.push(AccountMeta {
            pubkey: ai.key(),
            is_signer: ai.is_signer,
            is_writable: ai.is_writable,
        });
    }

    // Construct instruction to Jupiter
    let ix = Instruction {
        program_id: ctx.accounts.jupiter_program.key(),
        accounts: metas,
        data: route_data,
    };

    // Prepare account infos slice matching metas (do not include the program AccountInfo here)
    let mut infos: Vec<AccountInfo> = Vec::with_capacity(ctx.remaining_accounts.len());
    for ai in ctx.remaining_accounts.iter() {
        infos.push(ai.clone());
    }

    // Signer seeds for fund PDA
    let fund = &ctx.accounts.fund;
    let fund_seeds = [
        b"fund".as_ref(),
        fund.manager.as_ref(),
        fund.name.as_bytes(),
        &[fund.bump][..],
    ];
    let signer: &[&[&[u8]]] = &[&fund_seeds];

    // Optional DEX allowlist enforcement: any executable remaining account must be in DEX_ALLOWED.
    if !DEX_ALLOWED.is_empty() {
        for ai in ctx.remaining_accounts.iter() {
            if ai.executable {
                require!(DEX_ALLOWED.contains(&ai.key()), FundError::InvalidInput);
            }
        }
    }

    // CPI to Jupiter router
    invoke_signed(&ix, &infos, signer)
        .map_err(|_| error!(FundError::InvalidInput))?;

    // Post-snapshot destination balance and slippage check
    let post_amount = if let Some(a) = read_token_amount(&ctx.accounts.destination_account) {
        a
    } else {
        ctx.accounts.destination_account.lamports()
    };

    let received = post_amount
        .checked_sub(pre_amount)
        .ok_or(FundError::MathOverflow)?;
    require!(received >= minimum_amount_out, FundError::SlippageExceeded);

    Ok(())
}
