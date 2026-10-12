//! `initialize` (spec §5.1).
//!
//! Design reference: `solana-foundation/vault` (`create_vault`); no code is
//! copied (see docs/provenance.md). Design notes: only the program's upgrade authority may initialize; a data-less
//! vault-authority PDA (not the config account) owns four per-purpose token
//! accounts and the program-created share mint; roles, caps and price bounds
//! are validated. The upstream unrestricted asset withdrawal (`withdraw_assets`)
//! is not carried over: no instruction in this program moves reserve funds to an
//! arbitrary account (spec §1 principle 5).
//!
//! `initialize` also creates the income inbox (ADR 0017): the vault
//! authority's associated token account for the reserve mint, created
//! idempotently so it succeeds even if someone created it first; and the
//! `unsolicited` token account (ADR 0019, ADR 0024), which holds money sent
//! to the reserve unasked until the reserve admin books or returns it.
//!
//! The reserve mint must have 6 decimals (BRS), so every cap means what it
//! says in R$; a Token-2022 mint must pass the mint guard
//! (`token_guard::check_reserve_mint`), which also refuses a transfer-fee
//! config authority (ADR 0020).

use anchor_lang::{prelude::*, solana_program::bpf_loader_upgradeable};
use anchor_spl::{
    associated_token::{get_associated_token_address_with_program_id, AssociatedToken},
    token::Token,
    token_interface::{Mint, TokenAccount, TokenInterface},
};

use crate::{
    constants::*,
    errors::MutavError,
    events::{ConfigChanges, VaultInitialized},
    instructions::{
        admin::{validate_config, validate_money_accounts, validate_roles, Installing, Money},
        capital::create_owner_ata,
    },
    state::{CapsInput, VaultConfig, VaultState},
    token_guard,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct InitializeArgs {
    /// Squads vault address.
    pub admin: Pubkey,
    pub operator: Pubkey,
    pub pauser: Pubkey,
    pub mutav_capital_wallet: Pubkey,
    pub coverage_ratio_bps: u16,
    pub fee_take_bps: u16,
    pub caps: CapsInput,
}

#[event_cpi]
#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Must be the program's upgrade authority, so nobody can front-run
    /// initialization.
    pub upgrade_authority: Signer<'info>,

    // One-line CHECK so the IDL keeps no docs for this account.
    /// CHECK: this program's `ProgramData` (seeds); owner and bytes checked by `upgrade_authority_of`.
    #[account(
        seeds = [crate::ID.as_ref()],
        bump,
        seeds::program = bpf_loader_upgradeable::ID,
        constraint = upgrade_authority_of(&program_data)? == Some(upgrade_authority.key())
            @ MutavError::Unauthorized,
    )]
    pub program_data: UncheckedAccount<'info>,

    #[account(
        mint::token_program = reserve_token_program,
        constraint = reserve_mint.decimals == RESERVE_DECIMALS @ MutavError::InvalidMint,
    )]
    pub reserve_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        init,
        payer = payer,
        space = VAULT_CONFIG_SIZE,
        seeds = [CONFIG_SEED, reserve_mint.key().as_ref()],
        bump,
    )]
    pub config: Box<Account<'info, VaultConfig>>,

    #[account(
        init,
        payer = payer,
        space = VAULT_STATE_SIZE,
        seeds = [STATE_SEED, config.key().as_ref()],
        bump,
    )]
    pub state: Box<Account<'info, VaultState>>,

    /// CHECK: data-less PDA; owns the reserve token accounts and the share mint.
    #[account(seeds = [AUTHORITY_SEED, config.key().as_ref()], bump)]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(
        init,
        payer = payer,
        seeds = [SHARE_MINT_SEED, config.key().as_ref()],
        bump,
        mint::decimals = SHARE_DECIMALS,
        mint::authority = vault_authority,
        mint::freeze_authority = vault_authority,
        mint::token_program = share_token_program,
    )]
    pub share_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        init,
        payer = payer,
        seeds = [RESERVE_SEED, config.key().as_ref()],
        bump,
        token::mint = reserve_mint,
        token::authority = vault_authority,
        token::token_program = reserve_token_program,
    )]
    pub reserve: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        init,
        payer = payer,
        seeds = [PENDING_DEPOSITS_SEED, config.key().as_ref()],
        bump,
        token::mint = reserve_mint,
        token::authority = vault_authority,
        token::token_program = reserve_token_program,
    )]
    pub pending_deposits: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        init,
        payer = payer,
        seeds = [PENDING_REDEMPTIONS_SEED, config.key().as_ref()],
        bump,
        token::mint = share_mint,
        token::authority = vault_authority,
        token::token_program = share_token_program,
    )]
    pub pending_redemptions: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        init,
        payer = payer,
        seeds = [CLAIMS_SEED, config.key().as_ref()],
        bump,
        token::mint = reserve_mint,
        token::authority = vault_authority,
        token::token_program = reserve_token_program,
    )]
    pub claims: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Money sent to the reserve unasked (ADR 0024): `["unsolicited", config]`.
    #[account(
        init,
        payer = payer,
        seeds = [UNSOLICITED_SEED, config.key().as_ref()],
        bump,
        token::mint = reserve_mint,
        token::authority = vault_authority,
        token::token_program = reserve_token_program,
    )]
    pub unsolicited: Box<InterfaceAccount<'info, TokenAccount>>,

    /// The income inbox (ADR 0017): the vault authority's associated token
    /// account for `reserve_mint`, created here idempotently.
    /// CHECK: address checked in the handler; the ATA program creates it.
    #[account(mut)]
    pub income_inbox: UncheckedAccount<'info>,

    /// MUTAV treasury token account (BRS); receives the fee take.
    pub treasury_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// MUTAV payments token account (BRS); receives claim payments.
    pub payments_account: Box<InterfaceAccount<'info, TokenAccount>>,

    pub reserve_token_program: Interface<'info, TokenInterface>,
    /// The share mint is a classic SPL Token mint.
    pub share_token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn handle_initialize(ctx: Context<Initialize>, args: InitializeArgs) -> Result<()> {
    token_guard::check_reserve_mint(&ctx.accounts.reserve_mint.to_account_info())?;
    validate_roles(&args.admin, &args.operator, &args.pauser)?;
    validate_money_accounts(
        &ctx.accounts.reserve_mint.key(),
        Money::of(&ctx.accounts.treasury_account),
        Money::of(&ctx.accounts.payments_account),
        &args.mutav_capital_wallet,
        &ctx.accounts.vault_authority.key(),
        &args.operator,
        Installing::Both,
    )?;
    create_income_inbox(&ctx)?;
    // No seed deposit (spec §12 Q20, decided 2026-10-06): the reserve starts
    // with zero shares and `V = 1` handles the empty-reserve conversion.

    let config_key = ctx.accounts.config.key();
    let share_mint = ctx.accounts.share_mint.key();

    // The account was just created, so every field (and all padding) is zero;
    // write only the non-zero fields, in place.
    let config = &mut ctx.accounts.config;
    config.version = PROGRAM_LAYOUT_VERSION;
    config.bump = ctx.bumps.config;
    config.authority_bump = ctx.bumps.vault_authority;
    config.admin = args.admin;
    config.operator = args.operator;
    config.pauser = args.pauser;
    config.reserve_mint = ctx.accounts.reserve_mint.key();
    config.reserve_token_program = ctx.accounts.reserve_token_program.key();
    config.reserve_decimals = ctx.accounts.reserve_mint.decimals;
    config.share_mint = share_mint;
    config.coverage_ratio_bps = args.coverage_ratio_bps;
    config.fee_take_bps = args.fee_take_bps;
    config.payments_account = ctx.accounts.payments_account.key();
    config.treasury_account = ctx.accounts.treasury_account.key();
    config.mutav_capital_wallet = args.mutav_capital_wallet;
    // Initial values are announced by `VaultInitialized`, not `ConfigUpdated`.
    let mut ignored = ConfigChanges::default();
    config.apply_caps(&args.caps, &mut ignored);
    // `feature_flags`, `investor_allowlist_root`, `paused`, the pending
    // handovers, the guardians and every `_reserved` stay zero.
    // The same bounds as every `set_config` (ADR 0026).
    validate_config(config)?;

    let state = &mut ctx.accounts.state;
    state.version = PROGRAM_LAYOUT_VERSION;
    state.bump = ctx.bumps.state;
    // Empty accounting: mode Normal (0), every total and queue seq 0.

    emit_event!(
        ctx,
        VaultInitialized {
            config: config_key,
            ts: Clock::get()?.unix_timestamp,
            admin: args.admin,
            operator: args.operator,
            pauser: args.pauser,
            reserve_mint: ctx.accounts.reserve_mint.key(),
            share_mint,
        }
    );
    Ok(())
}

/// The upgrade authority recorded in a `ProgramData` account, read straight
/// from its bytes so that `initialize` does not link bincode and serde.
///
/// Same accept/reject rules and errors as Anchor's `Account<ProgramData>` load:
/// a missing account is `AccountNotInitialized`; an owner other than the
/// upgradeable loader is `AccountOwnedByWrongProgram`; another loader state is
/// `AccountNotProgramData`; bytes bincode would refuse are
/// `InvalidAccountData`. Layout (bincode `UpgradeableLoaderState::ProgramData`):
/// `u32` tag 3 at 0..4, `u64` slot at 4..12, option byte at 12 (0 `None`,
/// 1 `Some`), authority at 13..45.
fn upgrade_authority_of(info: &AccountInfo) -> Result<Option<Pubkey>> {
    if info.owner == &system_program::ID && info.lamports() == 0 {
        return Err(ErrorCode::AccountNotInitialized.into());
    }
    if info.owner != &bpf_loader_upgradeable::ID {
        return Err(Error::from(ErrorCode::AccountOwnedByWrongProgram)
            .with_pubkeys((*info.owner, bpf_loader_upgradeable::ID)));
    }
    let data = info.try_borrow_data()?;
    let invalid = || Error::from(ProgramError::InvalidAccountData);
    let tag = data.get(..4).ok_or_else(invalid)?;
    match u32::from_le_bytes([tag[0], tag[1], tag[2], tag[3]]) {
        3 => {}
        0..=2 => return Err(ErrorCode::AccountNotProgramData.into()),
        _ => return Err(invalid()),
    }
    match data.get(12) {
        Some(0) => Ok(None),
        Some(1) => {
            let key = data.get(13..45).ok_or_else(invalid)?;
            Ok(Some(Pubkey::try_from(key).map_err(|_| invalid())?))
        }
        _ => Err(invalid()),
    }
}

/// Creates the income inbox (ADR 0017) with an idempotent associated token
/// account create: it succeeds when a third party created the account first.
/// Nora pays issuer income here; it counts toward nothing until
/// `sweep_income` moves a statement's amount into `reserve`.
fn create_income_inbox(ctx: &Context<Initialize>) -> Result<()> {
    let a = &ctx.accounts;
    let expected = get_associated_token_address_with_program_id(
        &a.vault_authority.key(),
        &a.reserve_mint.key(),
        &a.reserve_token_program.key(),
    );
    require_keys_eq!(
        a.income_inbox.key(),
        expected,
        MutavError::InvalidIncomeSource
    );
    create_owner_ata(
        a.payer.to_account_info(),
        a.income_inbox.to_account_info(),
        a.vault_authority.to_account_info(),
        a.reserve_mint.to_account_info(),
        a.system_program.to_account_info(),
        a.reserve_token_program.to_account_info(),
        a.associated_token_program.key(),
    )
}
