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
    math::{assets_for, conversion_nav, mul_div, shares_for, Rounding},
    solvency::{head_starved, nav_per_share, Solvency, SolvencyInputs},
    state::{CapsInput, PriceInput},
    InitializeArgs, RegisterGuaranteeArgs,
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

fn si(x: i64) -> Value {
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

fn solvency_case(i: &SolvencyInputs) -> Value {
    let out = match Solvency::compute(i) {
        Ok(o) => json!({
            "tesouroValue": s(o.tesouro_value),
            "stableAssets": s(o.stable_assets),
            "coverageRequired": s(o.coverage_required),
            "surplus": s(o.surplus),
            "earmarkEff": s(o.earmark_eff),
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
            "tesouroUnits": s(i.tesouro_units),
            "tesouroPrice": s(i.tesouro_price),
            "remainingCoverTotal": s(i.remaining_cover_total),
            "coverageRatioBps": i.coverage_ratio_bps,
            "provisions": s(i.provisions),
            "bufferEarmark": s(i.buffer_earmark),
            "featureFlags": s(i.feature_flags),
            "headStarved": i.head_starved,
        },
        "output": out,
    })
}

fn solvency_vectors(rng: &mut Rng) -> Value {
    let base = SolvencyInputs {
        brs_balance: 60_000,
        tesouro_units: 40_000,
        tesouro_price: 1_005_000_000,
        remaining_cover_total: 80_000,
        coverage_ratio_bps: 10_000,
        provisions: 2_000,
        buffer_earmark: 5_000,
        feature_flags: INSTANT_EXIT,
        head_starved: false,
    };
    let mut cases = vec![
        base,
        // The pilot: flag clear, so the earmark has no effect.
        SolvencyInputs {
            feature_flags: 0,
            ..base
        },
        // Starved head releases the earmark.
        SolvencyInputs {
            head_starved: true,
            ..base
        },
        // Under-covered.
        SolvencyInputs {
            remaining_cover_total: 200_000,
            ..base
        },
        // Liquidity term binds.
        SolvencyInputs {
            provisions: 58_000,
            ..base
        },
        // c at the 0.10 floor (ADR 0016): the ratio term binds, then the
        // provisions term binds.
        SolvencyInputs {
            coverage_ratio_bps: MIN_COVERAGE_RATIO_BPS,
            ..base
        },
        SolvencyInputs {
            coverage_ratio_bps: MIN_COVERAGE_RATIO_BPS,
            provisions: 30_000,
            ..base
        },
        // Overflow paths.
        SolvencyInputs {
            brs_balance: MAX,
            tesouro_units: 1,
            tesouro_price: PRICE_SCALE,
            ..base
        },
        SolvencyInputs {
            brs_balance: MAX,
            tesouro_units: 0,
            provisions: MAX,
            remaining_cover_total: MAX,
            ..base
        },
        SolvencyInputs::default(),
    ];
    for k in 0..300 {
        let tesouro_units = if k % 3 == 0 { 0 } else { rng.amount() };
        cases.push(SolvencyInputs {
            brs_balance: rng.amount(),
            tesouro_units,
            tesouro_price: rng.next() % (3 * PRICE_SCALE),
            remaining_cover_total: rng.amount(),
            coverage_ratio_bps: rng.bps(),
            provisions: rng.amount(),
            buffer_earmark: rng.amount(),
            feature_flags: rng.next() % 4,
            head_starved: rng.next() % 4 == 0,
        });
    }
    Value::Array(cases.iter().map(solvency_case).collect())
}

fn starvation_vectors() -> Value {
    let cases: &[(i64, Option<i64>, i64)] = &[
        (1_000, Some(0), 999),
        (1_000, Some(0), 1_000),
        (1_000, Some(0), 0),
        (1_000, None, 10),
        (i64::MIN, Some(i64::MAX), 1),
        (i64::MAX, Some(i64::MIN), 1),
        (1_700_000_000, Some(1_699_000_000), 86_400),
        (1_700_000_000, Some(1_699_999_000), 86_400),
        (5, Some(10), -1),
    ];
    Value::Array(
        cases
            .iter()
            .map(|&(now, at, after)| {
                json!({
                    "now": si(now),
                    "headRequestedAt": at.map(si).unwrap_or(Value::Null),
                    "bufferReleaseAfterSecs": si(after),
                    "starved": head_starved(now, at, after),
                })
            })
            .collect(),
    )
}

// ---------------------------------------------------------------------------
// PDAs, allowlist, instruction data
// ---------------------------------------------------------------------------

fn pda_vectors(rng: &mut Rng) -> Value {
    let program = mutav::ID;
    let reserve_mint = rng.pubkey();
    let owner = rng.pubkey();
    let id = rng.bytes32();
    let agency_id = rng.bytes32();
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
            "agencyId": hex(&agency_id),
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
            "eventAuthority": pda(&[b"__event_authority"]).to_string(),
            "guarantee": guarantee.to_string(),
            "agencyExposure": pda(&[AGENCY_SEED, c, &agency_id]).to_string(),
            "feeReceipt": pda(&[FEE_SEED, c, &invoice]).to_string(),
            "claimFiling": pda(&[CLAIM_SEED, guarantee.as_ref(), &notice]).to_string(),
            "payout": pda(&[PAYOUT_SEED, guarantee.as_ref(), &notice]).to_string(),
            "depositRequest": pda(&[DEPOSIT_SEED, c, &seq.to_le_bytes()]).to_string(),
            "redeemRequest": pda(&[REDEEM_SEED, c, &seq.to_le_bytes()]).to_string(),
            "holderState": pda(&[HOLDER_SEED, c, owner.as_ref()]).to_string(),
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
        rent: 3_500_000_000,
        default_multiplier_bps: 30_000,
        exit_multiplier_bps: 10_000,
        default_cover: 10_500_000_000,
        exit_cover: 3_500_000_000,
    };
    let caps = CapsInput {
        max_tvl: 100_000_000_000,
        max_cover_per_guarantee: 30_000_000_000,
        max_cover_per_agency: 60_000_000_000,
        max_claim_per_call: 10_000_000_000,
        max_claim_per_period: 20_000_000_000,
        claim_period_secs: 2_592_000,
        max_tesouro_share_bps: 0,
        min_request: 1_000_000_000,
        max_request: 30_000_000_000,
        min_fill_assets: 500_000_000,
    };
    let price = PriceInput {
        tesouro_price_account: Pubkey::default(),
        p0: 1_000_000,
        t0: -5,
        y_max_bps: 1_500,
        max_staleness_secs: 86_400,
        max_deviation_bps: 200,
        max_nav_move_bps: 10_000,
    };
    let init = InitializeArgs {
        admin: rng.pubkey(),
        operator,
        pauser,
        mutav_capital_wallet: rng.pubkey(),
        coverage_ratio_bps: 10_000,
        fee_take_bps: 2_000,
        payout_sla_secs: 172_800,
        caps: caps.clone(),
        price: price.clone(),
    };
    let caps_json = json!({
        "maxTvl": s(caps.max_tvl),
        "maxCoverPerGuarantee": s(caps.max_cover_per_guarantee),
        "maxCoverPerAgency": s(caps.max_cover_per_agency),
        "maxClaimPerCall": s(caps.max_claim_per_call),
        "maxClaimPerPeriod": s(caps.max_claim_per_period),
        "claimPeriodSecs": si(caps.claim_period_secs),
        "maxTesouroShareBps": caps.max_tesouro_share_bps,
        "minRequest": s(caps.min_request),
        "maxRequest": s(caps.max_request),
        "minFillAssets": s(caps.min_fill_assets),
    });
    let price_json = json!({
        "tesouroPriceAccount": price.tesouro_price_account.to_string(),
        "p0": s(price.p0),
        "t0": si(price.t0),
        "yMaxBps": price.y_max_bps,
        "maxStalenessSecs": si(price.max_staleness_secs),
        "maxDeviationBps": price.max_deviation_bps,
        "maxNavMoveBps": price.max_nav_move_bps,
    });
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
                "payoutSlaSecs": si(init.payout_sla_secs),
                "caps": caps_json,
                "price": price_json,
            }}),
            mutav::instruction::Initialize { args: init }.data(),
        ),
        ix(
            "setRoles",
            json!({ "operator": operator.to_string(), "pauser": pauser.to_string() }),
            mutav::instruction::SetRoles { operator, pauser }.data(),
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
                "rent": s(reg.rent),
                "defaultMultiplierBps": reg.default_multiplier_bps,
                "exitMultiplierBps": reg.exit_multiplier_bps,
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
            json!({ "leg": LEG_EXIT, "amount": s(MAX), "noticeRefHash": hex(&notice) }),
            mutav::instruction::PayClaim {
                leg: LEG_EXIT,
                amount: MAX,
                notice_ref_hash: notice,
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
            json!({ "assets": s(5_000_000_000), "proof": hexes(&proof) }),
            mutav::instruction::RequestDeposit {
                assets: 5_000_000_000,
                proof: proof.clone(),
            }
            .data(),
        ),
        ix(
            "requestRedeem",
            json!({ "shares": s(1), "proof": Vec::<String>::new() }),
            mutav::instruction::RequestRedeem {
                shares: 1,
                proof: vec![],
            }
            .data(),
        ),
        ix(
            "fulfilDeposits",
            json!({ "count": 8 }),
            mutav::instruction::FulfilDeposits { count: 8 }.data(),
        ),
        ix(
            "fulfilRedeems",
            json!({ "count": 3, "maxAssets": s(MAX) }),
            mutav::instruction::FulfilRedeems {
                count: 3,
                max_assets: MAX,
            }
            .data(),
        ),
        ix(
            "advanceQueueHeads",
            json!({ "max": 255 }),
            mutav::instruction::AdvanceQueueHeads { max: 255 }.data(),
        ),
        ix("refresh", json!({}), mutav::instruction::Refresh {}.data()),
        ix("pause", json!({}), mutav::instruction::Pause {}.data()),
        ix(
            "clearFulfilHalt",
            json!({}),
            mutav::instruction::ClearFulfilHalt {}.data(),
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
            "priceScale": s(PRICE_SCALE),
            "navScale": s(NAV_SCALE),
            "virtualOffset": s(VIRTUAL_OFFSET),
            "bpsDenominator": BPS_DENOMINATOR,
            "minCoverageRatioBps": MIN_COVERAGE_RATIO_BPS,
            "instantExit": s(INSTANT_EXIT),
            "modeNormal": MODE_NORMAL,
            "modeUnderCovered": MODE_UNDER_COVERED,
            "maxAllowlistProofLen": MAX_ALLOWLIST_PROOF_LEN,
            "maxFulfilBatch": MAX_FULFIL_BATCH,
        },
        "mulDiv": mul_div_vectors(&mut rng),
        "conversion": conversion_vectors(&mut rng),
        "solvency": solvency_vectors(&mut rng),
        "headStarved": starvation_vectors(),
        "pdas": pda_vectors(&mut rng),
        "allowlist": allowlist_vectors(&mut rng),
        "instructions": instruction_vectors(&mut rng),
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
