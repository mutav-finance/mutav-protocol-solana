//! LiteSVM harness: program deployment with an upgrade authority, mock BRS
//! mints (classic SPL and Token-2022 with extensions), an initialized reserve
//! fixture, error and event assertions.

pub mod book;
pub mod capital;
pub mod mints;

pub use book::*;
pub use capital::*;

use std::path::PathBuf;

use anchor_lang::{
    event::EVENT_IX_TAG_LE,
    prelude::Pubkey,
    solana_program::{bpf_loader_upgradeable, instruction::Instruction},
    AccountDeserialize, AnchorDeserialize, Discriminator, InstructionData, ToAccountMetas,
};
use litesvm::{
    types::{FailedTransactionMetadata, TransactionMetadata, TransactionResult},
    LiteSVM,
};
use litesvm_token::{CreateAccount, CreateMint};
use mutav::{
    constants::*,
    errors::MutavError,
    state::{CapsInput, PriceInput, VaultConfig, VaultState},
    InitializeArgs,
};
use solana_instruction::error::InstructionError;
use solana_keypair::Keypair;
use solana_message::{Message, VersionedMessage};
use solana_signer::Signer;
use solana_transaction::versioned::VersionedTransaction;
use solana_transaction_error::TransactionError;

/// Decimals of BRS (and of the mock BRS mint used in tests).
pub const BRS_DECIMALS: u8 = 6;
/// R$1.00 in BRS base units.
pub const BRL: u64 = 1_000_000;

/// Classic SPL Token program id.
pub const TOKEN_PROGRAM: Pubkey = anchor_spl::token::ID;
/// Token-2022 program id.
pub const TOKEN_2022_PROGRAM: Pubkey = anchor_spl::token_2022::ID;

/// Path to a program built by `anchor build` (`target/deploy/<name>.so`).
pub fn program_so(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../target/deploy")
        .join(format!("{name}.so"))
}

/// A fresh LiteSVM with `mutav.so` deployed under the upgradeable loader and a
/// funded payer that is also the program's upgrade authority.
///
/// Panics with a clear message if `anchor build` has not been run.
pub fn setup() -> (LiteSVM, Keypair) {
    let mut svm = LiteSVM::new();
    let so = program_so("mutav");
    let bytes = std::fs::read(&so)
        .unwrap_or_else(|e| panic!("read {}: {e}. Run `anchor build` first.", so.display()));
    svm.add_program(mutav::ID, &bytes).expect("deploy mutav.so");

    let payer = Keypair::new();
    svm.airdrop(&payer.pubkey(), 100_000_000_000)
        .expect("airdrop");
    set_upgrade_authority(&mut svm, Some(payer.pubkey()));
    (svm, payer)
}

/// `ProgramData` PDA of the mutav program.
pub fn program_data_address() -> Pubkey {
    Pubkey::find_program_address(&[mutav::ID.as_ref()], &bpf_loader_upgradeable::ID).0
}

/// Rewrites the upgrade authority in the `ProgramData` account. Metadata
/// layout: `u32` tag (3), `u64` slot, `Option<Pubkey>` (1 + 32 bytes).
pub fn set_upgrade_authority(svm: &mut LiteSVM, authority: Option<Pubkey>) {
    let addr = program_data_address();
    let mut acc = svm.get_account(&addr).expect("program data");
    match authority {
        Some(a) => {
            acc.data[12] = 1;
            acc.data[13..45].copy_from_slice(a.as_ref());
        }
        None => {
            acc.data[12] = 0;
            acc.data[13..45].fill(0);
        }
    }
    svm.set_account(addr, acc).expect("set program data");
}

/// Create a BRS-like mint: 6 decimals, with a freeze authority held by the
/// test (BRS issuers can freeze accounts). Classic SPL Token.
pub fn create_brs_mint(svm: &mut LiteSVM, payer: &Keypair, freeze_authority: &Pubkey) -> Pubkey {
    let mint_authority = payer.pubkey();
    CreateMint::new(svm, payer)
        .authority(&mint_authority)
        .freeze_authority(freeze_authority)
        .decimals(BRS_DECIMALS)
        .send()
        .expect("create BRS mint")
}

/// A token account for `mint` owned by `owner`, under `token_program`.
pub fn create_token_account(
    svm: &mut LiteSVM,
    payer: &Keypair,
    mint: &Pubkey,
    owner: &Pubkey,
    token_program: &Pubkey,
) -> Pubkey {
    if *token_program == TOKEN_2022_PROGRAM {
        return mints::create_token2022_account(svm, payer, mint, owner);
    }
    CreateAccount::new(svm, payer, mint)
        .owner(owner)
        .token_program_id(token_program)
        .send()
        .expect("create token account")
}

/// Sign with `signers` (first one pays) and send a single-instruction tx.
/// Expires the blockhash afterwards so an identical transaction can follow.
pub fn send_ix(svm: &mut LiteSVM, ix: Instruction, signers: &[&Keypair]) -> TransactionResult {
    send_ixs(svm, &[ix], signers)
}

/// Sign and send several instructions in one transaction.
pub fn send_ixs(svm: &mut LiteSVM, ixs: &[Instruction], signers: &[&Keypair]) -> TransactionResult {
    let payer = signers[0].pubkey();
    let msg = Message::new_with_blockhash(ixs, Some(&payer), &svm.latest_blockhash());
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), signers).expect("sign");
    let res = svm.send_transaction(tx);
    svm.expire_blockhash();
    res
}

/// Serialized size of a legacy transaction with `n_signers` signatures.
pub fn tx_size(ixs: &[Instruction], payer: &Pubkey, n_signers: usize) -> usize {
    let msg = Message::new(ixs, Some(payer));
    // shortvec length (1 byte for < 128) + signatures + message.
    1 + 64 * n_signers + msg.serialize().len()
}

/// Asserts the transaction failed with `err` from this program.
pub fn assert_mutav_err(res: TransactionResult, err: MutavError) {
    let code = anchor_lang::error::ERROR_CODE_OFFSET + err as u32;
    assert_custom_err(res, code, &format!("{err:?}"));
}

/// Asserts the transaction failed with Anchor framework error `code`.
pub fn assert_anchor_err(res: TransactionResult, err: anchor_lang::error::ErrorCode) {
    assert_custom_err(res, err as u32, &format!("{err:?}"));
}

fn assert_custom_err(res: TransactionResult, code: u32, name: &str) {
    match res {
        Ok(_) => panic!("expected {name} ({code}), transaction succeeded"),
        Err(FailedTransactionMetadata { err, meta }) => match err {
            TransactionError::InstructionError(_, InstructionError::Custom(c)) if c == code => {}
            other => panic!(
                "expected {name} ({code}), got {other:?}\nlogs:\n{}",
                meta.logs.join("\n")
            ),
        },
    }
}

/// Asserts an `init` failed because the account already exists (the system
/// program's `AccountAlreadyInUse`, custom error 0): the duplicate-key path of
/// every one-per-reference PDA (spec §3.5–§3.7, §3.11).
pub fn assert_already_in_use(res: TransactionResult) {
    match res {
        Ok(_) => panic!("expected account-already-in-use, transaction succeeded"),
        Err(FailedTransactionMetadata { err, meta }) => match err {
            TransactionError::InstructionError(_, InstructionError::Custom(0)) => {
                assert!(
                    meta.logs.iter().any(|l| l.contains("already in use")),
                    "custom 0 without an already-in-use log:\n{}",
                    meta.logs.join("\n")
                );
            }
            other => panic!(
                "expected account-already-in-use, got {other:?}\nlogs:\n{}",
                meta.logs.join("\n")
            ),
        },
    }
}

/// The current `Clock` sysvar.
pub fn clock(svm: &LiteSVM) -> anchor_lang::prelude::Clock {
    svm.get_sysvar::<anchor_lang::prelude::Clock>()
}

/// Moves the clock to `unix_timestamp` (slot unchanged).
pub fn set_time(svm: &mut LiteSVM, unix_timestamp: i64) {
    let mut c = clock(svm);
    c.unix_timestamp = unix_timestamp;
    svm.set_sysvar(&c);
}

/// Events of type `E` emitted with `emit_cpi!` in a transaction, in order.
pub fn events<E: AnchorDeserialize + Discriminator>(meta: &TransactionMetadata) -> Vec<E> {
    let mut out = Vec::new();
    for ix in meta.inner_instructions.iter().flatten() {
        let data = &ix.instruction.data;
        if let Some(rest) = data.strip_prefix(EVENT_IX_TAG_LE) {
            if let Some(body) = rest.strip_prefix(E::DISCRIMINATOR) {
                out.push(E::try_from_slice(body).expect("decode event"));
            }
        }
    }
    out
}

/// Every PDA of one reserve.
#[derive(Clone, Copy, Debug)]
pub struct Pdas {
    pub config: Pubkey,
    pub state: Pubkey,
    pub authority: Pubkey,
    pub share_mint: Pubkey,
    pub reserve: Pubkey,
    pub pending_deposits: Pubkey,
    pub pending_redemptions: Pubkey,
    pub claims: Pubkey,
    pub event_authority: Pubkey,
}

impl Pdas {
    pub fn new(reserve_mint: &Pubkey) -> Self {
        let pda = |seeds: &[&[u8]]| Pubkey::find_program_address(seeds, &mutav::ID).0;
        let config = pda(&[CONFIG_SEED, reserve_mint.as_ref()]);
        let c = config.as_ref();
        Self {
            config,
            state: pda(&[STATE_SEED, c]),
            authority: pda(&[AUTHORITY_SEED, c]),
            share_mint: pda(&[SHARE_MINT_SEED, c]),
            reserve: pda(&[RESERVE_SEED, c]),
            pending_deposits: pda(&[PENDING_DEPOSITS_SEED, c]),
            pending_redemptions: pda(&[PENDING_REDEMPTIONS_SEED, c]),
            claims: pda(&[CLAIMS_SEED, c]),
            event_authority: pda(&[b"__event_authority"]),
        }
    }
}

/// Test caps: the spec §8 proposed pilot values (not decided values).
pub fn test_caps() -> CapsInput {
    CapsInput {
        max_tvl: 100_000 * BRL,
        max_cover_per_guarantee: 30_000 * BRL,
        max_cover_per_agency: 60_000 * BRL,
        max_claim_per_call: 10_000 * BRL,
        max_claim_per_period: 20_000 * BRL,
        claim_period_secs: 30 * 86_400,
        max_tesouro_share_bps: 5_000,
        min_request: 1_000 * BRL,
        max_request: 30_000 * BRL,
        min_fill_assets: 500 * BRL,
    }
}

/// Test price bounds (placeholders; spec §12 Q2, Q21).
pub fn test_price() -> PriceInput {
    PriceInput {
        tesouro_price_account: Pubkey::new_unique(),
        p0: 1_000_000,
        t0: 0,
        y_max_bps: 1_500,
        max_staleness_secs: 86_400,
        max_deviation_bps: 200,
        max_nav_move_bps: 100,
    }
}

/// Inputs to `initialize` other than the args.
pub struct InitAccounts {
    pub payer: Pubkey,
    pub upgrade_authority: Pubkey,
    pub reserve_mint: Pubkey,
    pub reserve_token_program: Pubkey,
    pub treasury: Pubkey,
    pub payments: Pubkey,
}

pub fn initialize_ix(a: &InitAccounts, args: InitializeArgs) -> Instruction {
    let p = Pdas::new(&a.reserve_mint);
    Instruction::new_with_bytes(
        mutav::ID,
        &mutav::instruction::Initialize { args }.data(),
        mutav::accounts::Initialize {
            payer: a.payer,
            upgrade_authority: a.upgrade_authority,
            program_data: program_data_address(),
            reserve_mint: a.reserve_mint,
            config: p.config,
            state: p.state,
            vault_authority: p.authority,
            share_mint: p.share_mint,
            reserve: p.reserve,
            pending_deposits: p.pending_deposits,
            pending_redemptions: p.pending_redemptions,
            claims: p.claims,
            treasury_account: a.treasury,
            payments_account: a.payments,
            reserve_token_program: a.reserve_token_program,
            share_token_program: TOKEN_PROGRAM,
            system_program: anchor_lang::solana_program::system_program::ID,
            event_authority: p.event_authority,
            program: mutav::ID,
        }
        .to_account_metas(None),
    )
}

/// An LiteSVM with the program deployed, a BRS mint, MUTAV's treasury and
/// payments token accounts, role keys, and (after `initialize`) a reserve.
pub struct Fixture {
    pub svm: LiteSVM,
    /// Pays every transaction; also the program's upgrade authority.
    pub payer: Keypair,
    pub admin: Keypair,
    pub operator: Keypair,
    pub pauser: Keypair,
    pub mutav_capital_wallet: Keypair,
    pub freeze_authority: Keypair,
    pub reserve_mint: Pubkey,
    pub token_program: Pubkey,
    pub treasury_owner: Pubkey,
    pub payments_owner: Pubkey,
    pub treasury: Pubkey,
    pub payments: Pubkey,
    pub pdas: Pdas,
}

impl Fixture {
    /// Everything except `initialize`, with a classic SPL BRS mint.
    pub fn uninitialized() -> Self {
        let (mut svm, payer) = setup();
        let freeze_authority = Keypair::new();
        let reserve_mint = create_brs_mint(&mut svm, &payer, &freeze_authority.pubkey());
        Self::with_mint(svm, payer, freeze_authority, reserve_mint, TOKEN_PROGRAM)
    }

    /// Everything except `initialize`, with a given mint.
    pub fn with_mint(
        mut svm: LiteSVM,
        payer: Keypair,
        freeze_authority: Keypair,
        reserve_mint: Pubkey,
        token_program: Pubkey,
    ) -> Self {
        let treasury_owner = Pubkey::new_unique();
        let payments_owner = Pubkey::new_unique();
        let treasury = create_token_account(
            &mut svm,
            &payer,
            &reserve_mint,
            &treasury_owner,
            &token_program,
        );
        let payments = create_token_account(
            &mut svm,
            &payer,
            &reserve_mint,
            &payments_owner,
            &token_program,
        );
        Self {
            svm,
            payer,
            admin: Keypair::new(),
            operator: Keypair::new(),
            pauser: Keypair::new(),
            mutav_capital_wallet: Keypair::new(),
            freeze_authority,
            reserve_mint,
            token_program,
            treasury_owner,
            payments_owner,
            treasury,
            payments,
            pdas: Pdas::new(&reserve_mint),
        }
    }

    /// A fully initialized reserve with the default test args.
    pub fn new() -> Self {
        let mut f = Self::uninitialized();
        f.initialize(f.init_args()).expect("initialize");
        f
    }

    pub fn init_args(&self) -> InitializeArgs {
        InitializeArgs {
            admin: self.admin.pubkey(),
            operator: self.operator.pubkey(),
            pauser: self.pauser.pubkey(),
            mutav_capital_wallet: self.mutav_capital_wallet.pubkey(),
            coverage_ratio_bps: 10_000,
            fee_take_bps: 2_000,
            payout_sla_secs: 10 * 86_400,
            caps: test_caps(),
            price: test_price(),
        }
    }

    pub fn init_accounts(&self) -> InitAccounts {
        InitAccounts {
            payer: self.payer.pubkey(),
            upgrade_authority: self.payer.pubkey(),
            reserve_mint: self.reserve_mint,
            reserve_token_program: self.token_program,
            treasury: self.treasury,
            payments: self.payments,
        }
    }

    pub fn initialize(&mut self, args: InitializeArgs) -> TransactionResult {
        let ix = initialize_ix(&self.init_accounts(), args);
        let payer = self.payer.insecure_clone();
        send_ix(&mut self.svm, ix, &[&payer])
    }

    /// Sends `ix` paid by the payer and signed by `signer` too.
    pub fn send(&mut self, ix: Instruction, signer: &Keypair) -> TransactionResult {
        let payer = self.payer.insecure_clone();
        if signer.pubkey() == payer.pubkey() {
            send_ix(&mut self.svm, ix, &[&payer])
        } else {
            send_ix(&mut self.svm, ix, &[&payer, signer])
        }
    }

    pub fn config(&self) -> VaultConfig {
        let acc = self.svm.get_account(&self.pdas.config).expect("config");
        VaultConfig::try_deserialize(&mut acc.data.as_slice()).expect("decode config")
    }

    pub fn state(&self) -> VaultState {
        let acc = self.svm.get_account(&self.pdas.state).expect("state");
        VaultState::try_deserialize(&mut acc.data.as_slice()).expect("decode state")
    }

    /// A new BRS token account owned by `owner`.
    pub fn token_account(&mut self, owner: &Pubkey) -> Pubkey {
        let payer = self.payer.insecure_clone();
        let mint = self.reserve_mint;
        let tp = self.token_program;
        create_token_account(&mut self.svm, &payer, &mint, owner, &tp)
    }
}

// ---------------------------------------------------------------------------
// Admin instruction builders
// ---------------------------------------------------------------------------

/// `SetConfigArgs` that reproduce the current config exactly.
pub fn set_config_args(c: &VaultConfig) -> mutav::SetConfigArgs {
    use mutav::state::ExitInput;
    mutav::SetConfigArgs {
        coverage_ratio_bps: c.coverage_ratio_bps,
        fee_take_bps: c.fee_take_bps,
        payout_sla_secs: c.payout_sla_secs,
        feature_flags: c.feature_flags,
        mutav_capital_wallet: c.mutav_capital_wallet,
        caps: CapsInput {
            max_tvl: c.caps.max_tvl,
            max_cover_per_guarantee: c.caps.max_cover_per_guarantee,
            max_cover_per_agency: c.caps.max_cover_per_agency,
            max_claim_per_call: c.caps.max_claim_per_call,
            max_claim_per_period: c.caps.max_claim_per_period,
            claim_period_secs: c.caps.claim_period_secs,
            max_tesouro_share_bps: c.caps.max_tesouro_share_bps,
            min_request: c.caps.min_request,
            max_request: c.caps.max_request,
            min_fill_assets: c.caps.min_fill_assets,
        },
        price: PriceInput {
            tesouro_price_account: c.price.tesouro_price_account,
            p0: c.price.p0,
            t0: c.price.t0,
            y_max_bps: c.price.y_max_bps,
            max_staleness_secs: c.price.max_staleness_secs,
            max_deviation_bps: c.price.max_deviation_bps,
            max_nav_move_bps: c.price.max_nav_move_bps,
        },
        exit: ExitInput {
            buffer_target_bps: c.exit.buffer_target_bps,
            buffer_headroom_bps: c.exit.buffer_headroom_bps,
            buffer_release_after_secs: c.exit.buffer_release_after_secs,
            curve_version: c.exit.curve_version,
            h_min_bps: c.exit.h_min_bps,
            h_peg_bps: c.exit.h_peg_bps,
            h_max_bps: c.exit.h_max_bps,
            pressure_epoch_secs: c.exit.pressure_epoch_secs,
            min_instant_assets: c.exit.min_instant_assets,
            max_instant_per_tx: c.exit.max_instant_per_tx,
            max_instant_per_wallet: c.exit.max_instant_per_wallet,
            max_instant_per_period: c.exit.max_instant_per_period,
            instant_period_secs: c.exit.instant_period_secs,
            min_hold_secs: c.exit.min_hold_secs,
            max_price_age_secs: c.exit.max_price_age_secs,
            allowlist_root: c.exit.allowlist_root,
            barred: c.exit.barred,
        },
    }
}

impl Fixture {
    fn ix(&self, data: Vec<u8>, metas: Vec<anchor_lang::prelude::AccountMeta>) -> Instruction {
        Instruction::new_with_bytes(mutav::ID, &data, metas)
    }

    pub fn set_config_ix(
        &self,
        signer: &Pubkey,
        args: mutav::SetConfigArgs,
        treasury: &Pubkey,
    ) -> Instruction {
        self.ix(
            mutav::instruction::SetConfig { args }.data(),
            mutav::accounts::SetConfig {
                admin: *signer,
                config: self.pdas.config,
                treasury_account: *treasury,
                payments_account: self.config().payments_account,
                event_authority: self.pdas.event_authority,
                program: mutav::ID,
            }
            .to_account_metas(None),
        )
    }

    pub fn set_roles_ix(&self, signer: &Pubkey, operator: Pubkey, pauser: Pubkey) -> Instruction {
        self.ix(
            mutav::instruction::SetRoles { operator, pauser }.data(),
            mutav::accounts::SetRoles {
                admin: *signer,
                config: self.pdas.config,
                event_authority: self.pdas.event_authority,
                program: mutav::ID,
            }
            .to_account_metas(None),
        )
    }

    pub fn set_payments_account_ix(
        &self,
        signer: &Pubkey,
        payments: &Pubkey,
        treasury: &Pubkey,
    ) -> Instruction {
        self.ix(
            mutav::instruction::SetPaymentsAccount {}.data(),
            mutav::accounts::SetPaymentsAccount {
                admin: *signer,
                config: self.pdas.config,
                payments_account: *payments,
                treasury_account: *treasury,
                event_authority: self.pdas.event_authority,
                program: mutav::ID,
            }
            .to_account_metas(None),
        )
    }

    pub fn set_allowlist_root_ix(&self, signer: &Pubkey, root: [u8; 32]) -> Instruction {
        self.ix(
            mutav::instruction::SetAllowlistRoot { root }.data(),
            mutav::accounts::SetAllowlistRoot {
                admin: *signer,
                config: self.pdas.config,
                event_authority: self.pdas.event_authority,
                program: mutav::ID,
            }
            .to_account_metas(None),
        )
    }

    pub fn pause_ix(&self, signer: &Pubkey) -> Instruction {
        self.ix(
            mutav::instruction::Pause {}.data(),
            mutav::accounts::Pause {
                signer: *signer,
                config: self.pdas.config,
                event_authority: self.pdas.event_authority,
                program: mutav::ID,
            }
            .to_account_metas(None),
        )
    }

    pub fn unpause_ix(&self, signer: &Pubkey) -> Instruction {
        self.ix(
            mutav::instruction::Unpause {}.data(),
            mutav::accounts::Unpause {
                admin: *signer,
                config: self.pdas.config,
                event_authority: self.pdas.event_authority,
                program: mutav::ID,
            }
            .to_account_metas(None),
        )
    }

    pub fn revoke_operator_ix(&self, signer: &Pubkey) -> Instruction {
        self.ix(
            mutav::instruction::RevokeOperator {}.data(),
            mutav::accounts::RevokeOperator {
                signer: *signer,
                config: self.pdas.config,
                event_authority: self.pdas.event_authority,
                program: mutav::ID,
            }
            .to_account_metas(None),
        )
    }

    /// `set_config` signed by the admin with the current treasury.
    pub fn set_config(&mut self, args: mutav::SetConfigArgs) -> TransactionResult {
        let treasury = self.config().treasury_account;
        let ix = self.set_config_ix(&self.admin.pubkey(), args, &treasury);
        let admin = self.admin.insecure_clone();
        self.send(ix, &admin)
    }
}

// ---------------------------------------------------------------------------
// Account injection and the pilot instruction set (spec §14.7)
// ---------------------------------------------------------------------------

impl Fixture {
    /// Raw bytes of an account (discriminator included).
    pub fn raw(&self, addr: &Pubkey) -> Vec<u8> {
        self.svm.get_account(addr).expect("account").data
    }

    /// Overwrites an account's data in place, as a newer binary (or a test)
    /// could. Length and owner are kept.
    pub fn write_raw(&mut self, addr: &Pubkey, data: &[u8]) {
        let mut acc = self.svm.get_account(addr).expect("account");
        assert_eq!(acc.data.len(), data.len(), "injected length");
        acc.data.copy_from_slice(data);
        self.svm.set_account(*addr, acc).expect("set_account");
    }

    /// Serializes `c` over the config account (discriminator included).
    pub fn write_config(&mut self, c: &VaultConfig) {
        let mut data = VaultConfig::DISCRIMINATOR.to_vec();
        anchor_lang::AnchorSerialize::serialize(c, &mut data).unwrap();
        let addr = self.pdas.config;
        self.write_raw(&addr, &data);
    }

    /// Serializes `s` over the state account (discriminator included).
    pub fn write_state(&mut self, s: &VaultState) {
        let mut data = VaultState::DISCRIMINATOR.to_vec();
        anchor_lang::AnchorSerialize::serialize(s, &mut data).unwrap();
        let addr = self.pdas.state;
        self.write_raw(&addr, &data);
    }

    /// One valid call of every instruction that exists after `initialize`,
    /// in an order where each succeeds on a fresh fixture. Each entry is
    /// `(name, instruction, signer)`. Extend this list as instructions land:
    /// padding, version and earmark tests walk it. The operator instructions
    /// come first, before `set_roles` and `revoke_operator` replace the
    /// operator.
    pub fn pilot_instructions(&mut self) -> Vec<(&'static str, Instruction, Keypair)> {
        let mut out = self.book_instructions();
        out.extend(self.capital_instructions());
        out.extend(self.admin_instructions());
        out
    }

    fn admin_instructions(&mut self) -> Vec<(&'static str, Instruction, Keypair)> {
        let admin = self.admin.insecure_clone();
        let c = self.config();

        let mut args = set_config_args(&c);
        args.fee_take_bps = c.fee_take_bps + 1;
        args.caps.max_tvl = c.caps.max_tvl + 1;
        args.exit.buffer_target_bps = 500;
        let set_config = self.set_config_ix(&admin.pubkey(), args, &c.treasury_account);

        let new_payments = self.token_account(&Pubkey::new_unique());
        let set_payments =
            self.set_payments_account_ix(&admin.pubkey(), &new_payments, &c.treasury_account);

        let (op, pa) = (Pubkey::new_unique(), Pubkey::new_unique());
        vec![
            ("set_config", set_config, admin.insecure_clone()),
            (
                "set_roles",
                self.set_roles_ix(&admin.pubkey(), op, pa),
                admin.insecure_clone(),
            ),
            ("set_payments_account", set_payments, admin.insecure_clone()),
            (
                "set_allowlist_root",
                self.set_allowlist_root_ix(&admin.pubkey(), [7; 32]),
                admin.insecure_clone(),
            ),
            (
                "pause",
                self.pause_ix(&admin.pubkey()),
                admin.insecure_clone(),
            ),
            (
                "unpause",
                self.unpause_ix(&admin.pubkey()),
                admin.insecure_clone(),
            ),
            (
                "revoke_operator",
                self.revoke_operator_ix(&admin.pubkey()),
                admin.insecure_clone(),
            ),
        ]
    }
}

// ---------------------------------------------------------------------------
// Token movements and freezes
// ---------------------------------------------------------------------------

/// A token-program CPI made inside a transaction.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TokenMove {
    Transfer(u64),
    MintTo(u64),
    Burn(u64),
}

/// Every SPL Token / Token-2022 `transfer`, `transfer_checked`, `mint_to`
/// (checked or not) and `burn` (checked or not) among the inner
/// instructions, in order. `keys` are the transaction's account keys.
pub fn token_moves(meta: &TransactionMetadata, keys: &[Pubkey]) -> Vec<TokenMove> {
    let mut out = vec![];
    for ix in meta.inner_instructions.iter().flatten() {
        let program = keys[ix.instruction.program_id_index as usize];
        if program != TOKEN_PROGRAM && program != TOKEN_2022_PROGRAM {
            continue;
        }
        let d = &ix.instruction.data;
        let amount = || u64::from_le_bytes(d[1..9].try_into().unwrap());
        match d[0] {
            3 | 12 => out.push(TokenMove::Transfer(amount())),
            7 | 14 => out.push(TokenMove::MintTo(amount())),
            8 | 15 => out.push(TokenMove::Burn(amount())),
            _ => {}
        }
    }
    out
}

impl Fixture {
    /// Like `send`, also returning the transaction's account keys (for
    /// `token_moves`).
    pub fn send_traced(
        &mut self,
        ix: Instruction,
        signer: &Keypair,
    ) -> (TransactionResult, Vec<Pubkey>) {
        let payer = self.payer.insecure_clone();
        let signers: Vec<&Keypair> = if signer.pubkey() == payer.pubkey() {
            vec![&payer]
        } else {
            vec![&payer, signer]
        };
        let msg =
            Message::new_with_blockhash(&[ix], Some(&payer.pubkey()), &self.svm.latest_blockhash());
        let keys = msg.account_keys.clone();
        let tx =
            VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &signers).expect("sign");
        let res = self.svm.send_transaction(tx);
        self.svm.expire_blockhash();
        (res, keys)
    }

    /// Freezes or thaws a BRS token account (the test holds the mint's
    /// freeze authority, as a BRS issuer would).
    pub fn set_frozen(&mut self, account: &Pubkey, frozen: bool) {
        use anchor_spl::token::spl_token::instruction::{freeze_account, thaw_account};
        let auth = self.freeze_authority.insecure_clone();
        let build = if frozen { freeze_account } else { thaw_account };
        let ix = build(
            &TOKEN_PROGRAM,
            account,
            &self.reserve_mint,
            &auth.pubkey(),
            &[],
        )
        .unwrap();
        self.send(ix, &auth).expect("freeze/thaw");
    }
}
