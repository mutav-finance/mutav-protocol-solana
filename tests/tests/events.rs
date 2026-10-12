//! Event coverage (spec §9; plan Task 10): every token movement is covered
//! by an event whose amounts match. The test walks the pilot instruction
//! list; an instruction that moves tokens without a mapping here fails it.

use mutav::events::*;
use mutav_tests::helpers::*;
use solana_signer::Signer;

use TokenMove::*;

fn sum(moves: &[TokenMove], f: impl Fn(&TokenMove) -> Option<u64>) -> u64 {
    moves.iter().filter_map(f).sum()
}

fn transfers(m: &[TokenMove]) -> u64 {
    sum(m, |x| if let Transfer(a) = x { Some(*a) } else { None })
}

/// Asserts the events of one instruction cover its token movements.
fn assert_covered(name: &str, meta: &litesvm::types::TransactionMetadata, moves: &[TokenMove]) {
    let only_transfers = moves.iter().all(|m| matches!(m, Transfer(_)));
    match name {
        "contribute_fees" => {
            // One event covering both transfers (take to the treasury, net
            // to the reserve).
            let ev = events::<FeesContributed>(meta);
            assert_eq!(ev.len(), 1, "{name}");
            let e = &ev[0];
            assert!(
                only_transfers && moves.len() == 1 + (e.take > 0) as usize,
                "{name}"
            );
            assert_eq!(transfers(moves), e.gross, "{name}");
            assert_eq!(e.take + e.net, e.gross, "{name}");
            assert!(moves.contains(&Transfer(e.net)), "{name}");
        }
        "sweep_income" => {
            // One event for the one transfer out of the inbox, into the
            // reserve (no take on issuer income, ADR 0019).
            let ev = events::<IncomeSwept>(meta);
            assert_eq!(ev.len(), 1, "{name}");
            let e = &ev[0];
            assert!(only_transfers && moves.len() == 1, "{name}");
            assert_eq!(transfers(moves), e.amount, "{name}");
        }
        "pay_claim" => {
            let ev = events::<ClaimPaid>(meta);
            assert_eq!(
                (ev.len(), moves),
                (1, &[Transfer(ev[0].amount)][..]),
                "{name}"
            );
        }
        "request_deposit" => {
            let ev = events::<DepositRequested>(meta);
            assert_eq!(
                (ev.len(), moves),
                (1, &[Transfer(ev[0].assets)][..]),
                "{name}"
            );
        }
        "cancel_deposit" => {
            let ev = events::<DepositCancelled>(meta);
            assert_eq!(
                (ev.len(), moves),
                (1, &[Transfer(ev[0].assets)][..]),
                "{name}"
            );
        }
        "fulfil_deposits" => {
            let ev = events::<DepositsFulfilled>(meta);
            assert_eq!(
                (ev.len(), moves),
                (1, &[Transfer(ev[0].assets)][..]),
                "{name}"
            );
        }
        "claim_shares" => {
            let ev = events::<SharesClaimed>(meta);
            assert_eq!(
                (ev.len(), moves),
                (1, &[MintTo(ev[0].shares)][..]),
                "{name}"
            );
        }
        "request_redeem" => {
            let ev = events::<RedeemRequested>(meta);
            assert_eq!(
                (ev.len(), moves),
                (1, &[Transfer(ev[0].shares)][..]),
                "{name}"
            );
        }
        "cancel_redeem" => {
            let ev = events::<RedeemCancelled>(meta);
            assert_eq!(
                (ev.len(), moves),
                (1, &[Transfer(ev[0].shares_returned)][..]),
                "{name}"
            );
        }
        "fulfil_redeems" => assert_redeem_batch(meta, moves),
        "claim_assets" => {
            let ev = events::<AssetsClaimed>(meta);
            assert_eq!(
                (ev.len(), moves),
                (1, &[Transfer(ev[0].assets)][..]),
                "{name}"
            );
        }
        _ => assert!(
            moves.is_empty(),
            "{name} moves tokens ({moves:?}) without an event mapping"
        ),
    }
}

/// One `RedeemFilled` per fill and one `RedeemsFulfilled` per batch; the
/// burn equals the shares filled and the transfer to `claims` the assets.
fn assert_redeem_batch(meta: &litesvm::types::TransactionMetadata, moves: &[TokenMove]) {
    let fills = events::<RedeemFilled>(meta);
    let batch = events::<RedeemsFulfilled>(meta);
    assert!(!fills.is_empty());
    assert_eq!(batch.len(), 1);
    let shares: u64 = fills.iter().map(|e| e.shares).sum();
    let assets: u64 = fills.iter().map(|e| e.assets).sum();
    assert_eq!((batch[0].shares, batch[0].assets), (shares, assets));
    assert_eq!(moves, &[Burn(shares), Transfer(assets)]);
    assert_eq!(batch[0].from_seq, fills[0].seq);
    assert_eq!(batch[0].to_seq, fills[fills.len() - 1].seq);
}

#[test]
fn every_token_movement_in_the_pilot_list_is_covered_by_an_event() {
    let mut f = Fixture::new();
    let mut moved = 0;
    for (name, ix, signer) in f.pilot_instructions() {
        let (res, keys) = f.send_traced(ix, &signer);
        let meta = res.unwrap_or_else(|e| panic!("{name}: {:?}", e.err));
        let moves = token_moves(&meta, &keys);
        moved += moves.len();
        assert_covered(name, &meta, &moves);
    }
    assert!(
        moved >= 12,
        "the list exercises the token-moving instructions"
    );
}

#[test]
fn a_multi_fill_batch_emits_one_event_per_fill() {
    let mut f = Fixture::new();
    let inv: Vec<Investor> = (0..3).map(|_| f.investor(10_000 * BRL)).collect();
    let keys: Vec<_> = inv.iter().map(|i| i.pubkey()).collect();
    let list = f.allowlist(&keys);
    for i in &inv {
        f.deposit(i, &list, 10_000 * BRL);
    }
    f.contribute(1_000 * BRL).0.unwrap(); // NAV above 1.0: fills differ
    let seqs: Vec<u64> = inv
        .iter()
        .enumerate()
        .map(|(n, i)| {
            f.request_redeem(i, &list, (2_000 + 1_000 * n as u64) * BRL)
                .1
        })
        .collect();
    let admin = f.admin.insecure_clone();
    let ix = f.fulfil_redeems_ix(&admin.pubkey(), 3, u64::MAX, &seqs);
    let (res, keys) = f.send_traced(ix, &admin);
    let meta = res.unwrap();
    assert_eq!(events::<RedeemFilled>(&meta).len(), 3);
    assert_redeem_batch(&meta, &token_moves(&meta, &keys));
}
