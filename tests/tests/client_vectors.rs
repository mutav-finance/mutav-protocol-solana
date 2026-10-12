//! Test vectors shared with the TypeScript client (plan Task 11).
//!
//! The Rust program is the reference. This test computes the math, PDA,
//! allowlist and instruction-encoding vectors from the program crate and
//! compares them with `tests/fixtures/client/vectors.json`. The client's Bun
//! tests (`clients/js/test/`) check the TypeScript mirror against the same
//! file, so the two sides cannot drift apart silently.
//!
//! Regenerate after a deliberate change:
//!
//! ```text
//! MUTAV_WRITE_VECTORS=1 cargo test -p mutav-tests --test client_vectors
//! ```
//!
//! Every `u64` / `i64` is a decimal string (JSON numbers lose precision above
//! 2^53); byte arrays are lowercase hex; pubkeys are base58. A result the
//! program rejects is the string `"error"`.
//!
//! Not covered: the partial-fill sizing of `fulfil_redeems` (deferred with
//! partial fills, ADR 0010). The pilot fills whole requests only, which the
//! client previews with `assets_for`.

use std::path::PathBuf;

use anchor_lang::{prelude::Pubkey, InstructionData};
use mutav::{
    allowlist,
    constants::*,
    coverage::{is_underwater, nav_per_share, Coverage, CoverageInputs},
    errors::MutavError,
    math::{assets_for, conversion_nav, mul_div, redeem_size_error, shares_for, Rounding},
    state::CapsInput,
    ConfigParam, Eligibility, InitializeArgs, NavBounds, RegisterGuaranteeArgs,
};
use serde_json::{json, Value};

const MAX: u64 = u64::MAX;

/// A fixed income statement reference (ADR 0017). Fixed rather than drawn
/// from the generator, so adding it moved no other vector.
const INCOME_REF_HASH: [u8; 32] = [0x17; 32];

fn fixture_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("fixtures/client/vectors.json")
}

/// Deterministic xorshift64*, so regenerating gives the same file.
struct Rng(u64);

impl Rng {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 >> 12;
        self.0 ^= self.0 << 25;
        self.0 ^= self.0 >> 27;
        self.0.wrapping_mul(0x2545_F491_4F6C_DD1D)
    }

    /// A value spread over magnitudes: small, BRS-sized and near `u64::MAX`.
    fn amount(&mut self) -> u64 {
        let r = self.next();
        match r % 5 {
            0 => r % 1_000,
            1 => r % 1_000_000_000_000, // up to R$ 1,000,000 (6 dp)
            2 => r % 1_000_000_000_000_000_000, // large but convertible
            3 => MAX - (r % 1_000),
            _ => r,
        }
    }

    fn bps(&mut self) -> u16 {
        let r = self.next();
        match r % 3 {
            0 => 10_000,
            1 => 10_000 + (r % 10_000) as u16,
            _ => (r % 20_001) as u16,
        }
    }

    fn bytes32(&mut self) -> [u8; 32] {
        let mut out = [0u8; 32];
        for chunk in out.chunks_mut(8) {
            chunk.copy_from_slice(&self.next().to_le_bytes());
        }
        out
    }

    fn pubkey(&mut self) -> Pubkey {
        Pubkey::new_from_array(self.bytes32())
    }
}

fn s(x: u64) -> Value {
    Value::String(x.to_string())
}

fn res(r: anchor_lang::Result<u64>) -> Value {
    r.map(s).unwrap_or_else(|_| Value::String("error".into()))
}

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

// ---------------------------------------------------------------------------
// Math
// ---------------------------------------------------------------------------

fn mul_div_vectors(rng: &mut Rng) -> Value {
    let mut cases = vec![
        (7, 3, 2),
        (8, 3, 2),
        (0, 3, 2),
        (MAX, MAX, MAX),
        (MAX, 10_000, 10_000),
        (MAX, 2, 1),
        (MAX, 3, 2),
        (1, 1, 0),
        (MAX, MAX, 1),
    ];
    for _ in 0..200 {
        let d = rng.amount();
        cases.push((rng.amount(), rng.amount(), d));
    }
    Value::Array(
        cases
            .into_iter()
            .map(|(a, b, d)| {
                json!({
                    "a": s(a), "b": s(b), "d": s(d),
                    "down": res(mul_div(a, b, d, Rounding::Down)),
                    "up": res(mul_div(a, b, d, Rounding::Up)),
                })
            })
            .collect(),
    )
}

fn conversion_vectors(rng: &mut Rng) -> Value {
    let mut cases = vec![
        (5_000_000, 0, 0),
        (5_000_000, 5_000_000, 5_000_000),
        (10, 100, 333),
        (32, 100, 333),
        (MAX, MAX, 0),
        (MAX, MAX, MAX - 1),
        (MAX, MAX - 1, MAX),
        (0, 0, MAX),
        (1_000_000, 1_000_000, 2_000_000),
    ];
    for _ in 0..200 {
        cases.push((rng.amount(), rng.amount(), rng.amount()));
    }
    Value::Array(
        cases
            .into_iter()
            .map(|(x, so, na)| {
                json!({
                    "x": s(x), "sharesOutstanding": s(so), "netAssets": s(na),
                    "sharesFor": res(shares_for(x, so, na)),
                    "assetsFor": res(assets_for(x, so, na)),
                    "conversionNav": res(conversion_nav(so, na)),
                    "navPerShare": res(nav_per_share(na, so)),
                })
            })
            .collect(),
    )
}

fn coverage_case(i: &CoverageInputs) -> Value {
    let out = match Coverage::compute(i) {
        Ok(o) => json!({
            "stableAssets": s(o.stable_assets),
            "coverageRequired": s(o.coverage_required),
            "surplus": s(o.surplus),
            "freeCapital": s(o.free_capital),
            "liquidBudget": s(o.liquid_budget),
            "netAssets": s(o.net_assets),
            "mode": o.mode(),
            "deficit": s(o.deficit()),
        }),
        Err(_) => Value::String("error".into()),
    };
    json!({
        "input": {
            "brsBalance": s(i.brs_balance),
            "remainingCoverTotal": s(i.remaining_cover_total),
            "coverageRatioBps": i.coverage_ratio_bps,
            "provisions": s(i.provisions),
            "stressBuffer": s(i.stress_buffer),
        },
        "output": out,
    })
}

fn coverage_vectors(rng: &mut Rng) -> Value {
    let base = CoverageInputs {
        brs_balance: 60_000,
        remaining_cover_total: 80_000,
        coverage_ratio_bps: 10_000,
        provisions: 2_000,
        stress_buffer: 0,
    };
    let mut cases = vec![
        base,
        // Under-covered.
        CoverageInputs {
            remaining_cover_total: 200_000,
            ..base
        },
        // Provisions bind.
        CoverageInputs {
            provisions: 58_000,
            ..base
        },
        // c at the 0.10 floor (ADR 0016): the ratio term binds, then the
        // provisions term binds.
        CoverageInputs {
            coverage_ratio_bps: MIN_COVERAGE_RATIO_BPS,
            ..base
        },
        CoverageInputs {
            coverage_ratio_bps: MIN_COVERAGE_RATIO_BPS,
            provisions: 30_000,
            ..base
        },
        // Overflow paths.
        CoverageInputs {
            remaining_cover_total: MAX,
            coverage_ratio_bps: 10_001,
            ..base
        },
        CoverageInputs {
            brs_balance: MAX,
            provisions: MAX,
            remaining_cover_total: MAX,
            ..base
        },
        // The stress buffer (ADR 0022): it binds over the ratio term, is
        // limited by the unprovisioned cover, and saturates.
        CoverageInputs {
            coverage_ratio_bps: MIN_COVERAGE_RATIO_BPS,
            provisions: 4_000,
            stress_buffer: 19_000,
            ..base
        },
        CoverageInputs {
            remaining_cover_total: 10_000,
            coverage_ratio_bps: MIN_COVERAGE_RATIO_BPS,
            provisions: 4_000,
            stress_buffer: 19_000,
            ..base
        },
        CoverageInputs {
            remaining_cover_total: MAX,
            provisions: MAX - 1,
            stress_buffer: MAX,
            ..base
        },
        CoverageInputs {
            remaining_cover_total: 5,
            provisions: 9,
            stress_buffer: MAX,
            ..base
        },
        CoverageInputs::default(),
    ];
    for k in 0..300u64 {
        let (brs, cover, c, prov) = (rng.amount(), rng.amount(), rng.bps(), rng.amount());
        // Derived without drawing from `rng`, so the vectors after these
        // stay where they were.
        let stress = match k % 4 {
            0 => 0,
            1 => cover / 7,
            2 => brs ^ prov,
            _ => MAX,
        };
        cases.push(CoverageInputs {
            brs_balance: brs,
            remaining_cover_total: cover,
            coverage_ratio_bps: c,
            provisions: prov,
            stress_buffer: stress,
        });
    }
    Value::Array(cases.iter().map(coverage_case).collect())
}

/// The underwater test and the `request_redeem` size rule (ADR 0029).
fn capital_rule_vectors(rng: &mut Rng) -> Value {
    let mut under: Vec<(u64, u64)> = vec![
        (0, 0),
        (0, 1),
        (1, 1_000_000_000),
        (1, 1_000_000_001),
        (MAX, MAX),
        (0, MAX),
    ];
    for _ in 0..100 {
        let shares = rng.amount();
        let net = match rng.next() % 3 {
            0 => shares / 1_000_000_000,
            1 => (shares / 1_000_000_000).saturating_sub(1),
            _ => rng.amount(),
        };
        under.push((net, shares));
    }
    let name = |e: Option<MutavError>| match e {
        None => Value::Null,
        Some(MutavError::RequestTooSmall) => Value::String("RequestTooSmall".into()),
        Some(MutavError::RequestTooLarge) => Value::String("RequestTooLarge".into()),
        Some(other) => panic!("unexpected {}", other as u32),
    };
    let mut sizes: Vec<(u64, u64, bool, u64, u64)> = vec![
        (0, 0, true, 1_000, 100_000),
        (100_001, 0, true, 1_000, 100_000),
        (1_000, 50_000, false, 1_000, 100_000),
        (500, 0, true, 1_000, 100_000),
        (500, 999, true, 1_000, 100_000),
        (500, 1_000, true, 1_000, 100_000),
        (500, 0, false, 1_000, 100_000),
        (100, 0, true, 1_000, 100_000),
        (99, 0, true, 1_000, 100_000),
        (1, 0, true, 5, 10),
    ];
    for _ in 0..200 {
        let min = 1 + rng.next() % 2_000_000_000;
        let max = min + rng.next() % 200_000_000_000;
        let value = rng.next() % (max + max / 10 + 1);
        let remainder = rng.next() % (2 * min);
        sizes.push((value, remainder, rng.next() % 2 == 0, min, max));
    }
    json!({
        "underwater": under
            .iter()
            .map(|(n, sh)| json!({ "netAssets": s(*n), "sharesOutstanding": s(*sh), "underwater": is_underwater(*n, *sh) }))
            .collect::<Vec<_>>(),
        "redeemSize": sizes
            .iter()
            .map(|(v, r, c, mn, mx)| json!({
                "value": s(*v), "remainder": s(*r), "canonical": c,
                "minRequest": s(*mn), "maxRequest": s(*mx),
                "error": name(redeem_size_error(*v, *r, *c, *mn, *mx)),
            }))
            .collect::<Vec<_>>(),
    })
}

// ---------------------------------------------------------------------------
// PDAs, allowlist, instruction data
// ---------------------------------------------------------------------------

fn pda_vectors(rng: &mut Rng) -> Value {
    let program = mutav::ID;
    let reserve_mint = rng.pubkey();
    let owner = rng.pubkey();
    let id = rng.bytes32();
    // Was the `AgencyExposure` seed input (retired, ADR 0019). Still drawn so
    // the vectors after it do not move.
    let _ = rng.bytes32();
    let invoice = rng.bytes32();
    let notice = rng.bytes32();
    let seq: u64 = 42;
    let pda = |seeds: &[&[u8]]| Pubkey::find_program_address(seeds, &program).0;
    let config = pda(&[CONFIG_SEED, reserve_mint.as_ref()]);
    let c = config.as_ref();
    let guarantee = pda(&[GUARANTEE_SEED, c, &id]);
    json!({
        "programAddress": program.to_string(),
        "inputs": {
            "reserveMint": reserve_mint.to_string(),
            "owner": owner.to_string(),
            "guaranteeId": hex(&id),
            "invoiceRefHash": hex(&invoice),
            "noticeRefHash": hex(&notice),
            "seq": s(seq),
            "incomeRefHash": hex(&INCOME_REF_HASH),
        },
        "expected": {
            "config": config.to_string(),
            "state": pda(&[STATE_SEED, c]).to_string(),
            "vaultAuthority": pda(&[AUTHORITY_SEED, c]).to_string(),
            "shareMint": pda(&[SHARE_MINT_SEED, c]).to_string(),
            "reserve": pda(&[RESERVE_SEED, c]).to_string(),
            "pendingDeposits": pda(&[PENDING_DEPOSITS_SEED, c]).to_string(),
            "pendingRedemptions": pda(&[PENDING_REDEMPTIONS_SEED, c]).to_string(),
            "claims": pda(&[CLAIMS_SEED, c]).to_string(),
            "unsolicited": pda(&[UNSOLICITED_SEED, c]).to_string(),
            "eventAuthority": pda(&[b"__event_authority"]).to_string(),
            "guarantee": guarantee.to_string(),
            "feeReceipt": pda(&[FEE_SEED, c, &invoice]).to_string(),
            "claimFiling": pda(&[CLAIM_SEED, guarantee.as_ref(), &notice]).to_string(),
            "depositRequest": pda(&[DEPOSIT_SEED, c, &seq.to_le_bytes()]).to_string(),
            "redeemRequest": pda(&[REDEEM_SEED, c, &seq.to_le_bytes()]).to_string(),
            "incomeReceipt": pda(&[INCOME_SEED, c, &INCOME_REF_HASH]).to_string(),
            // ADR 0017: the vault authority's associated token account for
            // the reserve mint, under the classic SPL Token program.
            "incomeInbox": anchor_spl::associated_token::get_associated_token_address_with_program_id(
                &pda(&[AUTHORITY_SEED, c]),
                &reserve_mint,
                &anchor_spl::token::ID,
            )
            .to_string(),
        },
    })
}

fn allowlist_vectors(rng: &mut Rng) -> Value {
    let owners: Vec<Pubkey> = (0..5).map(|_| rng.pubkey()).collect();
    let leaves: Vec<[u8; 32]> = owners.iter().map(allowlist::leaf).collect();
    let pairs: Vec<Value> = leaves
        .windows(2)
        .map(|w| json!({ "a": hex(&w[0]), "b": hex(&w[1]), "node": hex(&allowlist::node(&w[0], &w[1])) }))
        .collect();
    json!({
        "leaves": owners.iter().zip(&leaves).map(|(o, l)| json!({ "owner": o.to_string(), "leaf": hex(l) })).collect::<Vec<_>>(),
        "nodes": pairs,
    })
}

fn ix(name: &str, args: Value, data: Vec<u8>) -> Value {
    json!({ "name": name, "args": args, "data": hex(&data) })
}

fn instruction_vectors(rng: &mut Rng) -> Value {
    let (operator, pauser) = (rng.pubkey(), rng.pubkey());
    let root = rng.bytes32();
    let invoice = rng.bytes32();
    let notice = rng.bytes32();
    let pix = rng.bytes32();
    let proof = vec![rng.bytes32(), rng.bytes32()];
    let reg = RegisterGuaranteeArgs {
        id: rng.bytes32(),
        agency_id: rng.bytes32(),
        refs_hash: rng.bytes32(),
        default_cover: 10_500_000_000,
        exit_cover: 3_500_000_000,
    };
    let caps = CapsInput {
        max_tvl: 100_000_000_000,
        max_cover_per_guarantee: 30_000_000_000,
        max_claim_per_call: 10_000_000_000,
        max_claim_per_period: 20_000_000_000,
        min_request: 1_000_000_000,
        max_request: 30_000_000_000,
        max_nav_move_bps: 10_000,
        stress_buffer: 19_000_000_000,
        max_queue_wait_secs: 0,
        max_reinstate_age: 30 * 86_400,
    };
    let init = InitializeArgs {
        admin: rng.pubkey(),
        operator,
        pauser,
        mutav_capital_wallet: rng.pubkey(),
        coverage_ratio_bps: 10_000,
        fee_take_bps: 2_000,
        caps,
    };
    let caps_json = json!({
        "maxTvl": s(caps.max_tvl),
        "maxCoverPerGuarantee": s(caps.max_cover_per_guarantee),
        "maxClaimPerCall": s(caps.max_claim_per_call),
        "maxClaimPerPeriod": s(caps.max_claim_per_period),
        "minRequest": s(caps.min_request),
        "maxRequest": s(caps.max_request),
        "maxNavMoveBps": caps.max_nav_move_bps,
        "stressBuffer": s(caps.stress_buffer),
        "maxQueueWaitSecs": s(caps.max_queue_wait_secs as u64),
        "maxReinstateAge": s(caps.max_reinstate_age as u64),
    });
    let nav_bounds = NavBounds {
        min: 990_000_000,
        max: 1_010_000_000,
    };
    let nav_json = json!({ "min": s(nav_bounds.min), "max": s(nav_bounds.max) });
    let params = vec![
        ConfigParam::CoverageRatioBps(1_000),
        ConfigParam::MaxTvl(300_000_000_000),
        ConfigParam::MutavCapitalWallet(operator),
        ConfigParam::MaxReinstateAge(-1),
    ];
    let params_json = json!([
        { "__kind": "CoverageRatioBps", "fields": [1_000] },
        { "__kind": "MaxTvl", "fields": [s(300_000_000_000)] },
        { "__kind": "MutavCapitalWallet", "fields": [operator.to_string()] },
        { "__kind": "MaxReinstateAge", "fields": ["-1"] },
    ]);
    let guardians = [rng.pubkey(), Pubkey::default(), rng.pubkey()];
    let hexes = |v: &[[u8; 32]]| v.iter().map(|p| hex(p)).collect::<Vec<_>>();
    Value::Array(vec![
        ix(
            "initialize",
            json!({ "args": {
                "admin": init.admin.to_string(),
                "operator": init.operator.to_string(),
                "pauser": init.pauser.to_string(),
                "mutavCapitalWallet": init.mutav_capital_wallet.to_string(),
                "coverageRatioBps": init.coverage_ratio_bps,
                "feeTakeBps": init.fee_take_bps,
                "caps": caps_json,
            }}),
            mutav::instruction::Initialize { args: init }.data(),
        ),
        ix(
            "setConfig",
            json!({ "params": params_json }),
            mutav::instruction::SetConfig { params }.data(),
        ),
        ix(
            "proposeRole",
            json!({ "role": ROLE_PAUSER, "key": pauser.to_string() }),
            mutav::instruction::ProposeRole {
                role: ROLE_PAUSER,
                key: pauser,
            }
            .data(),
        ),
        ix(
            "acceptRole",
            json!({ "role": ROLE_OPERATOR }),
            mutav::instruction::AcceptRole {
                role: ROLE_OPERATOR,
            }
            .data(),
        ),
        ix(
            "proposeAdmin",
            json!({ "key": operator.to_string() }),
            mutav::instruction::ProposeAdmin { key: operator }.data(),
        ),
        ix(
            "acceptAdmin",
            json!({}),
            mutav::instruction::AcceptAdmin {}.data(),
        ),
        ix(
            "cancelPending",
            json!({ "role": ROLE_ADMIN }),
            mutav::instruction::CancelPending { role: ROLE_ADMIN }.data(),
        ),
        ix(
            "setGuardians",
            json!({ "guardians": guardians.iter().map(|g| g.to_string()).collect::<Vec<_>>() }),
            mutav::instruction::SetGuardians { guardians }.data(),
        ),
        ix(
            "revokePauser",
            json!({}),
            mutav::instruction::RevokePauser {}.data(),
        ),
        ix(
            "setTreasuryAccount",
            json!({}),
            mutav::instruction::SetTreasuryAccount {}.data(),
        ),
        ix(
            "closeGuarantee",
            json!({ "id": hex(&reg.id), "reason": CLOSE_VOID }),
            mutav::instruction::CloseGuarantee {
                id: reg.id,
                reason: CLOSE_VOID,
            }
            .data(),
        ),
        ix(
            "setAllowlistRoot",
            json!({ "root": hex(&root) }),
            mutav::instruction::SetAllowlistRoot { root }.data(),
        ),
        ix(
            "registerGuarantee",
            json!({ "args": {
                "id": hex(&reg.id),
                "agencyId": hex(&reg.agency_id),
                "refsHash": hex(&reg.refs_hash),
                "defaultCover": s(reg.default_cover),
                "exitCover": s(reg.exit_cover),
            }}),
            mutav::instruction::RegisterGuarantee { args: reg }.data(),
        ),
        ix(
            "contributeFees",
            json!({ "invoiceRefHash": hex(&invoice), "amount": s(350_000_000) }),
            mutav::instruction::ContributeFees {
                invoice_ref_hash: invoice,
                amount: 350_000_000,
            }
            .data(),
        ),
        ix(
            "fileClaim",
            json!({ "leg": LEG_DEFAULT, "amount": s(3_500_000_000), "noticeRefHash": hex(&notice) }),
            mutav::instruction::FileClaim {
                leg: LEG_DEFAULT,
                amount: 3_500_000_000,
                notice_ref_hash: notice,
            }
            .data(),
        ),
        ix(
            "payClaim",
            json!({ "noticeRefHash": hex(&notice), "expectedAmount": s(MAX) }),
            mutav::instruction::PayClaim {
                notice_ref_hash: notice,
                expected_amount: MAX,
            }
            .data(),
        ),
        ix(
            "settlePayout",
            json!({ "noticeRefHash": hex(&notice), "pixE2eHash": hex(&pix) }),
            mutav::instruction::SettlePayout {
                notice_ref_hash: notice,
                pix_e2e_hash: pix,
            }
            .data(),
        ),
        ix(
            "requestDeposit",
            json!({
                "assets": s(5_000_000_000),
                "minSharesOut": s(4_950_000_000),
                "eligibility": { "__kind": "Merkle", "proof": hexes(&proof) },
            }),
            mutav::instruction::RequestDeposit {
                assets: 5_000_000_000,
                min_shares_out: 4_950_000_000,
                eligibility: Eligibility::Merkle {
                    proof: proof.clone(),
                },
            }
            .data(),
        ),
        ix(
            "requestRedeem",
            json!({
                "shares": s(1),
                "minAssetsOut": s(0),
                "eligibility": { "__kind": "Merkle", "proof": Vec::<String>::new() },
            }),
            mutav::instruction::RequestRedeem {
                shares: 1,
                min_assets_out: 0,
                eligibility: Eligibility::Merkle { proof: vec![] },
            }
            .data(),
        ),
        ix(
            "fulfilDeposits",
            json!({ "count": 8, "navBounds": nav_json.clone() }),
            mutav::instruction::FulfilDeposits {
                count: 8,
                nav_bounds,
            }
            .data(),
        ),
        ix(
            "fulfilRedeems",
            json!({ "count": 3, "maxAssets": s(MAX), "navBounds": nav_json.clone() }),
            mutav::instruction::FulfilRedeems {
                count: 3,
                max_assets: MAX,
                nav_bounds,
            }
            .data(),
        ),
        ix(
            "advanceQueueHead",
            json!({ "queue": QUEUE_REDEEM, "max": 255 }),
            mutav::instruction::AdvanceQueueHead {
                queue: QUEUE_REDEEM,
                max: 255,
            }
            .data(),
        ),
        ix("refresh", json!({}), mutav::instruction::Refresh {}.data()),
        ix("pause", json!({}), mutav::instruction::Pause {}.data()),
        ix(
            "clearFulfilHalt",
            json!({ "navBounds": nav_json }),
            mutav::instruction::ClearFulfilHalt { nav_bounds }.data(),
        ),
        ix(
            "sweepIncome",
            json!({
                "incomeRefHash": hex(&INCOME_REF_HASH),
                "period": 202_610,
                "amount": s(1_234_567_890),
            }),
            mutav::instruction::SweepIncome {
                income_ref_hash: INCOME_REF_HASH,
                period: 202_610,
                amount: 1_234_567_890,
            }
            .data(),
        ),
    ])
}

fn build() -> Value {
    let mut rng = Rng(0x4d55_5441_565f_5631); // "MUTAV_V1"
    json!({
        "_comment": "Generated by tests/tests/client_vectors.rs (MUTAV_WRITE_VECTORS=1). Do not edit by hand.",
        "constants": {
            "navScale": s(NAV_SCALE),
            "virtualOffset": s(VIRTUAL_OFFSET),
            "bpsDenominator": BPS_DENOMINATOR,
            "minCoverageRatioBps": MIN_COVERAGE_RATIO_BPS,
            "instantExit": s(INSTANT_EXIT),
            "modeNormal": MODE_NORMAL,
            "modeUnderCovered": MODE_UNDER_COVERED,
            "maxAllowlistProofLen": MAX_ALLOWLIST_PROOF_LEN,
            "maxFulfilBatch": MAX_FULFIL_BATCH,
            "subMinimumExitFloorDivisor": s(SUB_MINIMUM_EXIT_FLOOR_DIVISOR),
        },
        "mulDiv": mul_div_vectors(&mut rng),
        "conversion": conversion_vectors(&mut rng),
        "coverage": coverage_vectors(&mut rng),
        "pdas": pda_vectors(&mut rng),
        "allowlist": allowlist_vectors(&mut rng),
        "instructions": instruction_vectors(&mut rng),
        // Own seed, after the others, so the vectors above do not move.
        "capitalRules": capital_rule_vectors(&mut Rng(0x4558_4954_5f52_554c)),
    })
}

#[test]
fn client_vectors_match_the_program() {
    let built = build();
    let path = fixture_path();
    if std::env::var_os("MUTAV_WRITE_VECTORS").is_some() {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        let mut text = serde_json::to_string_pretty(&built).unwrap();
        text.push('\n');
        std::fs::write(&path, text).unwrap();
        return;
    }
    let text = std::fs::read_to_string(&path).unwrap_or_else(|e| {
        panic!(
            "cannot read {}: {e}; run MUTAV_WRITE_VECTORS=1 cargo test -p mutav-tests --test client_vectors",
            path.display()
        )
    });
    let committed: Value = serde_json::from_str(&text).unwrap();
    assert!(
        committed == built,
        "tests/fixtures/client/vectors.json is stale; regenerate with MUTAV_WRITE_VECTORS=1 and re-run the client tests"
    );
}

/// The allowlist trees the TypeScript builder produced
/// (`tests/fixtures/client/allowlist-proofs.json`, written by
/// `bun scripts/devnet/allowlist.ts --write-fixture` and reproduced by the
/// client tests) verify under the program's own `allowlist::verify`.
#[test]
fn client_built_allowlist_proofs_verify_in_the_program() {
    let path =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("fixtures/client/allowlist-proofs.json");
    let text = std::fs::read_to_string(&path).unwrap();
    let v: Value = serde_json::from_str(&text).unwrap();
    let unhex = |h: &str| -> [u8; 32] {
        let mut out = [0u8; 32];
        for (i, b) in out.iter_mut().enumerate() {
            *b = u8::from_str_radix(&h[2 * i..2 * i + 2], 16).unwrap();
        }
        out
    };
    let trees = v["trees"].as_array().unwrap();
    assert_eq!(trees.len(), 5);
    for tree in trees {
        let root = unhex(tree["root"].as_str().unwrap());
        for entry in tree["proofs"].as_array().unwrap() {
            let owner: Pubkey = entry["owner"].as_str().unwrap().parse().unwrap();
            let proof: Vec<[u8; 32]> = entry["proof"]
                .as_array()
                .unwrap()
                .iter()
                .map(|p| unhex(p.as_str().unwrap()))
                .collect();
            assert!(
                allowlist::verify(&root, &owner, &proof),
                "proof for {owner} does not verify"
            );
            // A proof never verifies for another owner.
            assert!(!allowlist::verify(&root, &Pubkey::new_unique(), &proof));
        }
    }
}
