//! Compute units measured in LiteSVM (not the plan's Mollusk benchmark,
//! which is skipped for the hackathon build; see `MAX_FULFIL_BATCH`).
//! A guard against regressions only: a Squads vault transaction adds its own
//! overhead on top of these figures.
//!
//! `compute_unit_table` prints every instruction's cost and the worst cases
//! the off-chain composers size their `SetComputeUnitLimit` from
//! (docs/technical-resources/compute-units.md):
//!
//! ```text
//! cargo test -p mutav-tests --test compute -- --nocapture
//! ```
//!
//! `squads_execute_overhead` runs the same calls inside a Squads v4
//! `vault_transaction_execute`. It needs the Squads v4 program binary, which
//! this repo does not vendor, so it is ignored by default:
//!
//! ```text
//! solana program dump -u m SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf /tmp/squads_v4.so
//! SQUADS_V4_SO=/tmp/squads_v4.so cargo test -p mutav-tests --test compute -- --ignored --nocapture
//! ```

use std::collections::BTreeMap;

use anchor_lang::{
    prelude::{pubkey, AccountMeta, Pubkey},
    solana_program::instruction::Instruction,
    AnchorSerialize,
};
use litesvm::types::TransactionMetadata;
use mutav::{constants::MAX_FULFIL_BATCH, ConfigParam};
use mutav_tests::helpers::*;
use solana_keypair::Keypair;
use solana_signer::Signer;

/// The runtime's per-instruction default when a transaction sets no limit
/// (one top-level instruction, so also the transaction's budget).
const DEFAULT_LIMIT: u64 = 200_000;
/// The most a transaction can request with `SetComputeUnitLimit`.
const MAX_LIMIT: u64 = 1_400_000;

#[test]
fn a_full_fulfil_redeems_batch_fits_the_default_budget() {
    let mut f = Fixture::new();
    let n = MAX_FULFIL_BATCH as usize;
    let inv: Vec<Investor> = (0..n).map(|_| f.investor(5_000 * BRL)).collect();
    let keys: Vec<_> = inv.iter().map(|i| i.pubkey()).collect();
    let list = f.allowlist(&keys);
    for i in &inv {
        f.deposit(i, &list, 5_000 * BRL);
    }
    f.contribute(1_000 * BRL).0.unwrap();
    let seqs: Vec<u64> = inv
        .iter()
        .map(|i| f.request_redeem(i, &list, 2_000 * BRL).1)
        .collect();
    let admin = f.admin.insecure_clone();
    let ix = f.fulfil_redeems_ix(&admin.pubkey(), MAX_FULFIL_BATCH, u64::MAX, &seqs);
    let meta = f.send(ix, &admin).expect("full batch");
    let cu = meta.compute_units_consumed;
    println!("fulfil_redeems, {n} whole fills: {cu} CU");
    assert!(cu < DEFAULT_LIMIT, "{cu} CU");

    let meta = f.refresh().unwrap();
    println!("refresh: {} CU", meta.compute_units_consumed);
    let g = guarantee_args(unique_hash(), 10_000 * BRL, 0);
    f.register(g.clone()).unwrap();
    let c = Claim::on(&g, 1_000 * BRL);
    f.file_claim(c).unwrap();
    let meta = f.pay_claim(c).unwrap();
    println!("pay_claim: {} CU", meta.compute_units_consumed);
}

// ---------------------------------------------------------------------------
// The compute-unit table
// ---------------------------------------------------------------------------

/// Fresh fixtures per worst-case sample: PDA bump searches depend on the
/// random mint and wallet keys, so a single run under-reports the spread.
const SAMPLES: usize = 12;

/// Rows of `(call, min CU, max CU)`, printed as a Markdown table.
#[derive(Default)]
struct Table(Vec<(String, u64, u64)>);

impl Table {
    /// Runs `call` `n` times (each on a fresh fixture) and records the range.
    fn sample(&mut self, what: impl Into<String>, n: usize, mut call: impl FnMut() -> u64) -> u64 {
        let cus: Vec<u64> = (0..n).map(|_| call()).collect();
        let (min, max) = (*cus.iter().min().unwrap(), *cus.iter().max().unwrap());
        self.0.push((what.into(), min, max));
        max
    }

    fn print(&self, title: &str) {
        println!("\n{title}\n\n| call | CU min | CU max |\n| --- | ---: | ---: |");
        for (what, min, max) in &self.0 {
            println!("| {what} | {min} | {max} |");
        }
    }
}

const fn cu(meta: &TransactionMetadata) -> u64 {
    meta.compute_units_consumed
}

/// A reserve with `n` pending deposit requests (whole fills at the head),
/// after one deposit that minted the first shares.
fn pending_deposits(n: usize) -> (Fixture, Vec<u64>) {
    let mut f = Fixture::new();
    let first = f.investor(5_000 * BRL);
    let inv: Vec<Investor> = (0..n).map(|_| f.investor(5_000 * BRL)).collect();
    let mut keys: Vec<_> = inv.iter().map(|i| i.pubkey()).collect();
    keys.push(first.pubkey());
    let list = f.allowlist(&keys);
    f.deposit(&first, &list, 5_000 * BRL);
    let seqs = inv
        .iter()
        .map(|i| {
            let (res, seq) = f.request_deposit(i, &list, 2_000 * BRL);
            res.expect("request_deposit");
            seq
        })
        .collect();
    (f, seqs)
}

/// A reserve with `n` pending redeem requests (whole fills at the head).
fn pending_redeems(n: usize) -> (Fixture, Vec<u64>) {
    let mut f = Fixture::new();
    let inv: Vec<Investor> = (0..n).map(|_| f.investor(5_000 * BRL)).collect();
    let keys: Vec<_> = inv.iter().map(|i| i.pubkey()).collect();
    let list = f.allowlist(&keys);
    for i in &inv {
        f.deposit(i, &list, 5_000 * BRL);
    }
    f.contribute(1_000 * BRL).0.unwrap();
    let seqs = inv
        .iter()
        .map(|i| {
            let (res, seq) = f.request_redeem(i, &list, 2_000 * BRL);
            res.expect("request_redeem");
            seq
        })
        .collect();
    (f, seqs)
}

/// Every settable `set_config` field changed at once (`feature_flags` has no
/// supported bit, so it is listed at its current value).
fn every_field_changed(f: &Fixture) -> Vec<ConfigParam> {
    use ConfigParam::*;
    let c = f.config();
    let k = &c.caps;
    vec![
        CoverageRatioBps(c.coverage_ratio_bps - 1_000),
        FeeTakeBps(c.fee_take_bps + 1),
        FeatureFlags(c.feature_flags),
        MutavCapitalWallet(Pubkey::new_unique()),
        MaxTvl(k.max_tvl + 1),
        MaxCoverPerGuarantee(k.max_cover_per_guarantee + 1),
        MaxClaimPerCall(k.max_claim_per_call + 1),
        MaxClaimPerPeriod(k.max_claim_per_period + 1),
        MinRequest(k.min_request + 1),
        MaxRequest(k.max_request + 1),
        MaxNavMoveBps(k.max_nav_move_bps + 1),
        StressBuffer(k.stress_buffer + 1),
        MaxQueueWaitSecs(k.max_queue_wait_secs + 1),
        MaxReinstateAge(k.max_reinstate_age + 1),
    ]
}

/// A claim above `max_claim_per_call`, filed: it needs `approve_claim`
/// before `pay_claim` (ADR 0021).
fn filed_over_the_call_cap() -> (Fixture, Claim) {
    let mut f = Fixture::new();
    f.fund_reserve(30_000 * BRL);
    let g = guarantee_args(unique_hash(), 30_000 * BRL, 0);
    f.register(g.clone()).expect("register");
    let c = Claim::on(&g, 10_000 * BRL + 1);
    f.file_claim(c).expect("file");
    (f, c)
}

// One worst-case call each, on a fresh fixture; each returns its CU.

fn initialize() -> u64 {
    // Pilot: a classic SPL Token reserve mint.
    let mut f = Fixture::uninitialized();
    let ix = initialize_ix(&f.init_accounts(), f.init_args());
    let payer = f.payer.insecure_clone();
    cu(&send_ix(&mut f.svm, ix, &[&payer]).expect("initialize"))
}

fn fill_deposits() -> u64 {
    let (mut f, seqs) = pending_deposits(MAX_FULFIL_BATCH as usize);
    let admin = f.admin.insecure_clone();
    let ix = f.fulfil_deposits_ix(&admin.pubkey(), MAX_FULFIL_BATCH, &seqs);
    cu(&f.send(ix, &admin).expect("fulfil_deposits"))
}

/// Fills the redeem batch; returns the fill's CU and the next `refresh`'s.
fn fill_redeems_then_refresh() -> (u64, u64) {
    let (mut f, seqs) = pending_redeems(MAX_FULFIL_BATCH as usize);
    let admin = f.admin.insecure_clone();
    let ix = f.fulfil_redeems_ix(&admin.pubkey(), MAX_FULFIL_BATCH, u64::MAX, &seqs);
    let fill = cu(&f.send(ix, &admin).expect("fulfil_redeems"));
    (fill, cu(&f.refresh().expect("refresh")))
}

fn set_config_every_field() -> u64 {
    let mut f = Fixture::new();
    f.refresh().unwrap();
    let params = every_field_changed(&f);
    cu(&f.set_config_alone(params).expect("set_config"))
}

/// What the app sends when c, the NAV-move bound or the stress buffer
/// changes: refresh, set_config, refresh in one transaction.
fn set_config_bundle() -> u64 {
    let mut f = Fixture::new();
    let admin = f.admin.insecure_clone();
    let payer = f.payer.insecure_clone();
    let ixs = [
        f.refresh_ix(),
        f.set_config_ix(&admin.pubkey(), every_field_changed(&f)),
        f.refresh_ix(),
    ];
    cu(&send_ixs(&mut f.svm, &ixs, &[&payer, &admin]).expect("bundle"))
}

/// `approve_claim` above the call cap, then the `pay_claim` it unlocks.
fn approve_then_pay() -> (u64, u64) {
    let (mut f, c) = filed_over_the_call_cap();
    let approve = cu(&f.approve_claim(c).expect("approve_claim"));
    (approve, cu(&f.pay_claim(c).expect("pay_claim")))
}

#[test]
fn compute_unit_table() {
    // Every instruction once, as the pilot list runs them (max per name).
    let mut f = Fixture::new();
    let mut each: BTreeMap<&'static str, u64> = BTreeMap::new();
    for (name, ix, signer) in f.pilot_instructions() {
        let meta = f
            .send(ix, &signer)
            .unwrap_or_else(|e| panic!("{name}: {e:?}"));
        let cu = each.entry(name).or_default();
        *cu = (*cu).max(meta.compute_units_consumed);
    }
    let mut every = Table::default();
    for (name, cu) in &each {
        every.0.push((name.to_string(), *cu, *cu));
    }

    let n = MAX_FULFIL_BATCH;
    let mut t = Table::default();
    t.sample("initialize", SAMPLES, initialize);
    t.sample(
        format!("fulfil_deposits, {n} whole fills"),
        SAMPLES,
        fill_deposits,
    );
    let fills: Vec<_> = (0..SAMPLES).map(|_| fill_redeems_then_refresh()).collect();
    let mut it = fills.iter();
    t.sample(format!("fulfil_redeems, {n} whole fills"), SAMPLES, || {
        it.next().unwrap().0
    });
    let mut it = fills.iter();
    t.sample("refresh (after the redeem fills)", SAMPLES, || {
        it.next().unwrap().1
    });
    t.sample(
        "set_config, every field changed",
        SAMPLES,
        set_config_every_field,
    );
    t.sample(
        "refresh + set_config (every field) + refresh, one transaction",
        SAMPLES,
        set_config_bundle,
    );
    let claims: Vec<_> = (0..SAMPLES).map(|_| approve_then_pay()).collect();
    let mut it = claims.iter();
    t.sample("approve_claim, above max_claim_per_call", SAMPLES, || {
        it.next().unwrap().0
    });
    let mut it = claims.iter();
    t.sample(
        "pay_claim, approved above max_claim_per_call",
        SAMPLES,
        || it.next().unwrap().1,
    );

    every.print("Every instruction (pilot list, max per name)");
    t.print(&format!("Worst cases ({SAMPLES} fresh fixtures each)"));

    // Fall back to opt-level "s" if any call comes within 30% of the max.
    for (what, _, max) in every.0.iter().chain(t.0.iter()) {
        assert!(*max < MAX_LIMIT * 7 / 10, "{what}: {max} CU");
    }
}

// ---------------------------------------------------------------------------
// Squads v4 `vault_transaction_execute` overhead
// ---------------------------------------------------------------------------

mod squads {
    use super::*;

    pub const PROGRAM: Pubkey = pubkey!("SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf");
    const COMPUTE_BUDGET: Pubkey = pubkey!("ComputeBudget111111111111111111111111111111");
    const SYSTEM: Pubkey = pubkey!("11111111111111111111111111111111");

    // Anchor discriminators, sha256("global:<name>")[..8] / ("account:Multisig").
    const VAULT_TRANSACTION_CREATE: [u8; 8] = [48, 250, 78, 168, 208, 226, 218, 211];
    const PROPOSAL_CREATE: [u8; 8] = [220, 60, 73, 224, 30, 108, 79, 159];
    const PROPOSAL_APPROVE: [u8; 8] = [144, 37, 164, 136, 188, 216, 42, 248];
    const VAULT_TRANSACTION_EXECUTE: [u8; 8] = [194, 8, 161, 87, 153, 164, 25, 171];
    const MULTISIG: [u8; 8] = [224, 116, 121, 186, 68, 161, 79, 236];

    /// `SetComputeUnitLimit(units)`.
    pub fn set_limit(units: u32) -> Instruction {
        let mut data = vec![2u8];
        data.extend_from_slice(&units.to_le_bytes());
        Instruction::new_with_bytes(COMPUTE_BUDGET, &data, vec![])
    }

    /// A 1-of-1 multisig (time lock 0) whose only member holds every
    /// permission, written straight into the account.
    pub struct Multisig {
        pub address: Pubkey,
        pub vault: Pubkey,
        pub member: Keypair,
        index: u64,
    }

    impl Multisig {
        pub fn new(f: &mut Fixture) -> Self {
            let create_key = Pubkey::new_unique();
            let (address, bump) = Pubkey::find_program_address(
                &[b"multisig", b"multisig", create_key.as_ref()],
                &PROGRAM,
            );
            let (vault, _) = Pubkey::find_program_address(
                &[b"multisig", address.as_ref(), b"vault", &[0]],
                &PROGRAM,
            );
            let member = Keypair::new();
            f.svm.airdrop(&member.pubkey(), 10_000_000_000).unwrap();
            f.svm.airdrop(&vault, 10_000_000_000).unwrap();
            let mut data = MULTISIG.to_vec();
            data.extend_from_slice(create_key.as_ref());
            data.extend_from_slice(Pubkey::default().as_ref()); // autonomous
            data.extend_from_slice(&1u16.to_le_bytes()); // threshold
            data.extend_from_slice(&0u32.to_le_bytes()); // time lock
            data.extend_from_slice(&0u64.to_le_bytes()); // transaction index
            data.extend_from_slice(&0u64.to_le_bytes()); // stale index
            data.push(0); // rent collector: None
            data.push(bump);
            data.extend_from_slice(&1u32.to_le_bytes());
            data.extend_from_slice(member.pubkey().as_ref());
            data.push(7); // initiate | vote | execute
            data.resize(data.len() + 64, 0);
            // Any system account as a template: only its fields are reused.
            let mut acc = f.svm.get_account(&member.pubkey()).unwrap();
            acc.lamports = f.svm.minimum_balance_for_rent_exemption(data.len());
            acc.data = data;
            acc.owner = PROGRAM;
            f.svm.set_account(address, acc).unwrap();
            Self {
                address,
                vault,
                member,
                index: 0,
            }
        }

        fn pda(&self, index: u64, tail: &[&[u8]]) -> Pubkey {
            let i = index.to_le_bytes();
            let mut seeds: Vec<&[u8]> =
                vec![b"multisig", self.address.as_ref(), b"transaction", &i];
            seeds.extend_from_slice(tail);
            Pubkey::find_program_address(&seeds, &PROGRAM).0
        }

        /// Create, propose and approve a vault transaction of `ixs` (the vault
        /// the only signer), then execute it under `limit`. Returns the
        /// execute transaction's metadata.
        pub fn run(
            &mut self,
            f: &mut Fixture,
            ixs: &[Instruction],
            limit: u32,
        ) -> TransactionMetadata {
            self.index += 1;
            let index = self.index;
            let transaction = self.pda(index, &[]);
            let proposal = self.pda(index, &[b"proposal"]);
            let (message, keys) = compile(&self.vault, ixs);
            let m = self.member.pubkey();

            let mut data = VAULT_TRANSACTION_CREATE.to_vec();
            data.push(0); // vault index
            data.push(0); // ephemeral signers
            message.serialize(&mut data).unwrap(); // Vec<u8>: u32 length + bytes
            data.push(0); // memo: None
            let create = Instruction::new_with_bytes(
                PROGRAM,
                &data,
                vec![
                    AccountMeta::new(self.address, false),
                    AccountMeta::new(transaction, false),
                    AccountMeta::new_readonly(m, true),
                    AccountMeta::new(m, true),
                    AccountMeta::new_readonly(SYSTEM, false),
                ],
            );
            let mut data = PROPOSAL_CREATE.to_vec();
            data.extend_from_slice(&index.to_le_bytes());
            data.push(0); // not a draft
            let propose = Instruction::new_with_bytes(
                PROGRAM,
                &data,
                vec![
                    AccountMeta::new_readonly(self.address, false),
                    AccountMeta::new(proposal, false),
                    AccountMeta::new_readonly(m, true),
                    AccountMeta::new(m, true),
                    AccountMeta::new_readonly(SYSTEM, false),
                ],
            );
            let mut data = PROPOSAL_APPROVE.to_vec();
            data.push(0); // memo: None
            let approve = Instruction::new_with_bytes(
                PROGRAM,
                &data,
                vec![
                    AccountMeta::new_readonly(self.address, false),
                    AccountMeta::new(m, true),
                    AccountMeta::new(proposal, false),
                ],
            );
            let member = self.member.insecure_clone();
            send_ixs(
                &mut f.svm,
                &[set_limit(1_400_000), create, propose, approve],
                &[&member],
            )
            .expect("create, propose, approve");

            let mut metas = vec![
                AccountMeta::new_readonly(self.address, false),
                AccountMeta::new(proposal, false),
                AccountMeta::new_readonly(transaction, false),
                AccountMeta::new_readonly(m, true),
            ];
            metas.extend(keys);
            let execute = Instruction::new_with_bytes(PROGRAM, &VAULT_TRANSACTION_EXECUTE, metas);
            send_ixs(&mut f.svm, &[set_limit(limit), execute], &[&member])
                .unwrap_or_else(|e| panic!("execute: {:?}\n{}", e.err, e.meta.logs.join("\n")))
        }
    }

    /// The Squads `TransactionMessage` bytes for `ixs` (small-vec encoding:
    /// u8 lengths, u16 for instruction data), and the execute instruction's
    /// remaining accounts: the message keys in order, none a signer.
    fn compile(vault: &Pubkey, ixs: &[Instruction]) -> (Vec<u8>, Vec<AccountMeta>) {
        // (key, signer, writable), the vault first: it pays.
        let mut keys: Vec<(Pubkey, bool, bool)> = vec![(*vault, true, true)];
        let mut put = |k: Pubkey, s: bool, w: bool| match keys.iter_mut().find(|x| x.0 == k) {
            Some(x) => {
                x.1 |= s;
                x.2 |= w;
            }
            None => keys.push((k, s, w)),
        };
        for ix in ixs {
            for a in &ix.accounts {
                put(a.pubkey, a.is_signer, a.is_writable);
            }
            put(ix.program_id, false, false);
        }
        let rank = |&(_, s, w): &(Pubkey, bool, bool)| match (s, w) {
            (true, true) => 0,
            (true, false) => 1,
            (false, true) => 2,
            (false, false) => 3,
        };
        keys.sort_by_key(rank); // stable: the vault stays first
        for (k, s, _) in &keys {
            assert!(!*s || k == vault, "{k} must sign; only the vault can");
        }
        let idx = |k: &Pubkey| keys.iter().position(|x| x.0 == *k).unwrap() as u8;
        let count = |r: u8| keys.iter().filter(|x| rank(x) == r).count() as u8;

        let mut m = vec![count(0) + count(1), count(0), count(2), keys.len() as u8];
        for (k, _, _) in &keys {
            m.extend_from_slice(k.as_ref());
        }
        m.push(ixs.len() as u8);
        for ix in ixs {
            m.push(idx(&ix.program_id));
            m.push(ix.accounts.len() as u8);
            m.extend(ix.accounts.iter().map(|a| idx(&a.pubkey)));
            m.extend_from_slice(&(ix.data.len() as u16).to_le_bytes());
            m.extend_from_slice(&ix.data);
        }
        m.push(0); // no address table lookups
        let metas = keys
            .iter()
            .map(|&(k, _, w)| AccountMeta {
                pubkey: k,
                is_signer: false,
                is_writable: w,
            })
            .collect();
        (m, metas)
    }
}

/// Through a Squads vault transaction: each call with the vault as its
/// signer (the upgrade authority and payer for `initialize`, the admin for
/// the rest). Returns the execute transaction's CU.
mod via {
    use super::*;
    use squads::Multisig;

    fn squads_so() -> Vec<u8> {
        let so = std::env::var("SQUADS_V4_SO").expect("SQUADS_V4_SO");
        std::fs::read(&so).expect("read SQUADS_V4_SO")
    }

    fn multisig(f: &mut Fixture) -> Multisig {
        f.svm
            .add_program(squads::PROGRAM, &squads_so())
            .expect("add squads");
        Multisig::new(f)
    }

    /// A multisig whose vault is `VaultConfig.admin`.
    fn admin_multisig(f: &mut Fixture) -> Multisig {
        let ms = multisig(f);
        let mut c = f.config();
        c.admin = ms.vault;
        f.write_config(&c);
        ms
    }

    pub fn initialize() -> u64 {
        let mut f = Fixture::uninitialized();
        let mut ms = multisig(&mut f);
        set_upgrade_authority(&mut f.svm, Some(ms.vault));
        let mut a = f.init_accounts();
        a.payer = ms.vault;
        a.upgrade_authority = ms.vault;
        let mut args = f.init_args();
        args.admin = ms.vault;
        cu(&ms.run(&mut f, &[initialize_ix(&a, args)], MAX_LIMIT as u32))
    }

    pub fn fill_deposits() -> u64 {
        let (mut f, seqs) = pending_deposits(MAX_FULFIL_BATCH as usize);
        let mut ms = admin_multisig(&mut f);
        let ix = f.fulfil_deposits_ix(&ms.vault, MAX_FULFIL_BATCH, &seqs);
        cu(&ms.run(&mut f, &[ix], MAX_LIMIT as u32))
    }

    pub fn fill_redeems() -> u64 {
        let (mut f, seqs) = pending_redeems(MAX_FULFIL_BATCH as usize);
        let mut ms = admin_multisig(&mut f);
        let ix = f.fulfil_redeems_ix(&ms.vault, MAX_FULFIL_BATCH, u64::MAX, &seqs);
        cu(&ms.run(&mut f, &[ix], MAX_LIMIT as u32))
    }

    pub fn set_config_bundle() -> u64 {
        let mut f = Fixture::new();
        let mut ms = admin_multisig(&mut f);
        let ixs = [
            f.refresh_ix(),
            f.set_config_ix(&ms.vault, every_field_changed(&f)),
            f.refresh_ix(),
        ];
        cu(&ms.run(&mut f, &ixs, MAX_LIMIT as u32))
    }

    pub fn approve_claim() -> u64 {
        let (mut f, c) = filed_over_the_call_cap();
        let mut ms = admin_multisig(&mut f);
        let ix = f.approve_claim_ix(&ms.vault, c, c.amount);
        cu(&ms.run(&mut f, &[ix], MAX_LIMIT as u32))
    }
}

#[test]
#[ignore = "needs the Squads v4 binary: set SQUADS_V4_SO (see the module docs)"]
fn squads_execute_overhead() {
    let n = MAX_FULFIL_BATCH;
    let k = SAMPLES / 2;
    let mut t = Table::default();
    t.sample(
        "initialize, through the upgrade multisig",
        k,
        via::initialize,
    );
    t.sample(
        format!("fulfil_deposits, {n} whole fills"),
        k,
        via::fill_deposits,
    );
    t.sample(
        format!("fulfil_redeems, {n} whole fills"),
        k,
        via::fill_redeems,
    );
    t.sample(
        "refresh + set_config (every field) + refresh",
        k,
        via::set_config_bundle,
    );
    t.sample("approve_claim", k, via::approve_claim);
    t.print(&format!(
        "Squads v4 vault_transaction_execute transaction, SetComputeUnitLimit included ({k} fresh fixtures each)"
    ));
}
