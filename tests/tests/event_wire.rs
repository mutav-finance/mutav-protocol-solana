//! Event wire format (spec §9, §14.2): every event leaves the program as the
//! `emit_cpi!` self-CPI — this program, one account (the event authority,
//! signed by its seeds), data = event-ix tag ++ discriminator ++ Borsh body —
//! and the pilot instruction list emits the same events in the same order as
//! the golden list below, captured before the shared emit helper replaced
//! the inlined `emit_cpi!` sites.

use anchor_lang::{event::EVENT_IX_TAG_LE, AnchorDeserialize, Discriminator};
use mutav::events::*;
use mutav_tests::helpers::*;

/// One row per event type.
struct EventRow {
    disc: &'static [u8],
    name: &'static str,
    /// Decodes a body exactly (no trailing bytes).
    decodes: fn(&[u8]) -> bool,
    /// Decodes a sample from `bytes` and returns
    /// `(emit_event bytes, emit_cpi! bytes)` for it.
    both_encodings: fn(&[u8]) -> (Vec<u8>, Vec<u8>),
}

macro_rules! event_table {
    ($($e:ident),* $(,)?) => {
        vec![$(EventRow {
            disc: <$e as Discriminator>::DISCRIMINATOR,
            name: stringify!($e),
            decodes: |b| <$e>::try_from_slice(b).is_ok(),
            both_encodings: |bytes| {
                let sample = <$e>::deserialize(&mut &bytes[..]).expect("sample");
                let ours = mutav::events::event_ix_data(&sample).expect("encode");
                // What `emit_cpi!` builds: the tag, then `Event::data`.
                let anchor: Vec<u8> = EVENT_IX_TAG_LE
                    .iter()
                    .copied()
                    .chain(anchor_lang::Event::data(&sample))
                    .collect();
                (ours, anchor)
            },
        }),*]
    };
}

fn all_events() -> Vec<EventRow> {
    event_table!(
        VaultInitialized,
        ConfigUpdated,
        RoleProposed,
        RoleAccepted,
        HandoverCancelled,
        GuardiansUpdated,
        OperatorRevoked,
        PauserRevoked,
        PaymentsAccountUpdated,
        TreasuryAccountUpdated,
        AllowlistRootUpdated,
        Paused,
        Unpaused,
        GuaranteeRegistered,
        GuaranteeClosed,
        FeesContributed,
        IncomeSwept,
        ClaimFiled,
        ClaimPaid,
        PayoutSettled,
        DepositRequested,
        DepositCancelled,
        SharesClaimed,
        DepositsFulfilled,
        DepositFilled,
        RedeemRequested,
        RedeemFilled,
        RedeemsFulfilled,
        RedeemCancelled,
        AssetsClaimed,
        QueueHeadsAdvanced,
        StateRefreshed,
        FulfilHaltRaised,
        ModeChanged,
        ReserveFrozenDetected,
        FulfilHaltCleared,
        DepositParked,
        RedeemParked,
        ClaimApproved,
    )
}

#[test]
fn the_table_lists_every_idl_event() {
    let idl: serde_json::Value = serde_json::from_slice(
        &std::fs::read(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../target/idl/mutav.json"
        ))
        .expect("read IDL (run `anchor build`)"),
    )
    .expect("parse IDL");
    let mut idl_names: Vec<String> = idl["events"]
        .as_array()
        .expect("events")
        .iter()
        .map(|e| e["name"].as_str().expect("name").to_string())
        .collect();
    let mut ours: Vec<String> = all_events().iter().map(|e| e.name.to_string()).collect();
    idl_names.sort();
    ours.sort();
    assert_eq!(ours, idl_names);
}

#[test]
fn emit_event_bytes_equal_emit_cpi_bytes_for_every_event() {
    // Pseudo-random sample values; a second, 0/1-only stream keeps `bool`
    // fields decodable.
    let mut x: u64 = 0x9e37_79b9_7f4a_7c15;
    let random: Vec<u8> = (0..512)
        .map(|_| {
            x ^= x << 13;
            x ^= x >> 7;
            x ^= x << 17;
            x as u8
        })
        .collect();
    let bits: Vec<u8> = random.iter().map(|b| b & 1).collect();
    for row in all_events() {
        for bytes in [&random, &bits] {
            let sample = std::panic::catch_unwind(|| (row.both_encodings)(bytes));
            let Ok((ours, anchor)) = sample else { continue };
            assert_eq!(ours, anchor, "{}", row.name);
            assert!(ours.starts_with(EVENT_IX_TAG_LE) && ours[8..].starts_with(row.disc));
        }
        // At least the 0/1 stream decodes for every event.
        let (ours, anchor) = (row.both_encodings)(&bits);
        assert_eq!(ours, anchor, "{}", row.name);
    }
}

/// Checks the shape of every self-CPI in `meta` and returns the event names,
/// in emit order.
fn event_names(
    meta: &litesvm::types::TransactionMetadata,
    keys: &[anchor_lang::prelude::Pubkey],
    event_authority: &anchor_lang::prelude::Pubkey,
) -> Vec<&'static str> {
    let table = all_events();
    let mut out = Vec::new();
    for inner in meta.inner_instructions.iter().flatten() {
        let ix = &inner.instruction;
        if keys[ix.program_id_index as usize] != mutav::ID {
            continue;
        }
        // Only the event self-CPI calls back into this program.
        let rest = ix
            .data
            .strip_prefix(EVENT_IX_TAG_LE)
            .expect("self-CPI is an event");
        assert_eq!(ix.accounts.len(), 1, "one account: the event authority");
        assert_eq!(&keys[ix.accounts[0] as usize], event_authority);
        let row = table
            .iter()
            .find(|r| rest.starts_with(r.disc))
            .unwrap_or_else(|| panic!("unknown event discriminator {:?}", &rest[..8]));
        assert!(
            (row.decodes)(&rest[8..]),
            "{}: body is exactly one Borsh value",
            row.name
        );
        out.push(row.name);
    }
    out
}

#[test]
fn pilot_list_emits_the_golden_events_in_the_cpi_wire_format() {
    let mut f = Fixture::uninitialized();
    let ea = f.pdas.event_authority;
    let mut got = Vec::new();
    let payer = f.payer.insecure_clone();
    let init = initialize_ix(&f.init_accounts(), f.init_args());
    let (res, keys) = f.send_traced(init, &payer);
    got.push((
        "initialize",
        event_names(&res.expect("initialize"), &keys, &ea),
    ));
    for (name, ix, signer) in f.pilot_instructions() {
        let (res, keys) = f.send_traced(ix, &signer);
        let meta = res.unwrap_or_else(|e| panic!("{name}: {:?}", e.err));
        got.push((name, event_names(&meta, &keys, &ea)));
    }
    assert_eq!(got, golden());
}

/// Captured from the program with the inlined `emit_cpi!` sites.
fn golden() -> Vec<(&'static str, Vec<&'static str>)> {
    vec![
        ("initialize", vec!["VaultInitialized"]),
        ("contribute_fees", vec!["FeesContributed"]),
        ("register_guarantee", vec!["GuaranteeRegistered"]),
        ("file_claim", vec!["ClaimFiled"]),
        ("approve_claim", vec!["ClaimApproved"]),
        ("pay_claim", vec!["ClaimPaid"]),
        ("settle_payout", vec!["PayoutSettled"]),
        ("close_guarantee", vec!["GuaranteeClosed"]),
        ("sweep_income", vec!["IncomeSwept"]),
        ("request_deposit", vec!["DepositRequested"]),
        ("request_deposit", vec!["DepositRequested"]),
        ("cancel_deposit", vec!["DepositCancelled"]),
        (
            "fulfil_deposits",
            vec!["DepositFilled", "DepositsFulfilled"],
        ),
        ("claim_shares", vec!["SharesClaimed"]),
        ("request_redeem", vec!["RedeemRequested"]),
        ("request_redeem", vec!["RedeemRequested"]),
        ("cancel_redeem", vec!["RedeemCancelled"]),
        ("fulfil_redeems", vec!["RedeemFilled", "RedeemsFulfilled"]),
        ("claim_assets", vec!["AssetsClaimed"]),
        ("advance_queue_head", vec!["QueueHeadsAdvanced"]),
        ("advance_queue_head", vec!["QueueHeadsAdvanced"]),
        ("refresh", vec!["StateRefreshed"]),
        ("set_config", vec!["ConfigUpdated", "ConfigUpdated"]),
        ("propose_role", vec!["ConfigUpdated", "RoleProposed"]),
        (
            "accept_role",
            vec!["ConfigUpdated", "ConfigUpdated", "RoleAccepted"],
        ),
        ("propose_role", vec!["ConfigUpdated", "RoleProposed"]),
        ("cancel_pending", vec!["ConfigUpdated", "HandoverCancelled"]),
        ("set_guardians", vec!["ConfigUpdated", "GuardiansUpdated"]),
        (
            "set_treasury_account",
            vec!["ConfigUpdated", "TreasuryAccountUpdated"],
        ),
        (
            "set_payments_account",
            vec!["ConfigUpdated", "PaymentsAccountUpdated"],
        ),
        (
            "set_allowlist_root",
            vec!["ConfigUpdated", "AllowlistRootUpdated"],
        ),
        ("pause", vec!["ConfigUpdated", "Paused"]),
        ("unpause", vec!["ConfigUpdated", "Unpaused"]),
        ("revoke_operator", vec!["ConfigUpdated", "OperatorRevoked"]),
        ("revoke_pauser", vec!["ConfigUpdated", "PauserRevoked"]),
        ("propose_admin", vec!["ConfigUpdated", "RoleProposed"]),
        (
            "accept_admin",
            vec!["ConfigUpdated", "ConfigUpdated", "RoleAccepted"],
        ),
    ]
}
