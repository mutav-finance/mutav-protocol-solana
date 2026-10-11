//! Roles, the two-step handover, guardians, pause and operator revocation
//! (spec §2, §5.1; ADR 0020).

use anchor_lang::prelude::Pubkey;
use mutav::{
    constants::*,
    errors::MutavError,
    events::{
        ConfigUpdated, GuardiansUpdated, HandoverCancelled, OperatorRevoked, Paused, RoleAccepted,
        RoleProposed, Unpaused,
    },
    ConfigParam,
};
use mutav_tests::helpers::*;
use solana_keypair::Keypair;
use solana_signer::Signer;

fn funded(f: &mut Fixture) -> Keypair {
    let k = Keypair::new();
    f.svm.airdrop(&k.pubkey(), 1_000_000_000).unwrap();
    k
}

fn fields(meta: &litesvm::types::TransactionMetadata) -> Vec<u16> {
    events::<ConfigUpdated>(meta)
        .iter()
        .map(|e| e.field)
        .collect()
}

fn propose(f: &mut Fixture, role: u8, key: Pubkey) -> litesvm::types::TransactionResult {
    let admin = f.admin.insecure_clone();
    let ix = f.propose_role_ix(&admin.pubkey(), role, key);
    f.send(ix, &admin)
}

fn accept(f: &mut Fixture, role: u8, key: &Keypair) -> litesvm::types::TransactionResult {
    let ix = f.accept_role_ix(&key.pubkey(), role);
    f.send(ix, key)
}

#[test]
fn every_admin_instruction_rejects_a_non_admin_signer() {
    let mut f = Fixture::new();
    let payments = f.payments;
    let operator = f.operator.insecure_clone();
    let pauser = f.pauser.insecure_clone();
    let stranger = Keypair::new();
    let guardian = Keypair::new();
    let admin = f.admin.insecure_clone();
    let ix = f.set_guardians_ix(
        &admin.pubkey(),
        [guardian.pubkey(), Pubkey::default(), Pubkey::default()],
    );
    f.send(ix, &admin).unwrap();
    propose(&mut f, ROLE_PAUSER, Pubkey::new_unique()).unwrap();

    for signer in [&operator, &pauser, &stranger, &guardian] {
        let k = signer.pubkey();
        let new_account = f.token_account(&Pubkey::new_unique());
        let treasury = f.config().treasury_account;
        let ixs = [
            f.set_config_ix(&k, vec![ConfigParam::MaxTvl(1)]),
            f.propose_role_ix(&k, ROLE_OPERATOR, Pubkey::new_unique()),
            f.propose_admin_ix(&k, Pubkey::new_unique()),
            f.cancel_pending_ix(&k, ROLE_PAUSER),
            f.set_guardians_ix(&k, [Pubkey::default(); 3]),
            f.set_payments_account_ix(&k, &new_account, &treasury),
            f.set_treasury_account_ix(&k, &new_account),
            f.set_allowlist_root_ix(&k, [1; 32]),
            f.unpause_ix(&k),
            f.clear_fulfil_halt_ix(&k),
        ];
        for ix in ixs {
            assert_mutav_err(f.send(ix, signer), MutavError::Unauthorized);
        }
    }
    // Nothing changed.
    let c = f.config();
    assert_eq!(c.payments_account, payments);
    assert_eq!(c.investor_allowlist_root, [0; 32]);
    assert_eq!(c.operator, operator.pubkey());
    assert_ne!(c.pending_pauser, Pubkey::default());
    assert_eq!(c.guardians[0], guardian.pubkey());
}

// ===========================================================================
// pause / unpause
// ===========================================================================

#[test]
fn pause_by_pauser_admin_or_guardian() {
    let mut f = Fixture::new();
    let pauser = f.pauser.insecure_clone();
    let admin = f.admin.insecure_clone();
    let guardian = funded(&mut f);
    let ix = f.set_guardians_ix(
        &admin.pubkey(),
        [Pubkey::default(), Pubkey::default(), guardian.pubkey()],
    );
    f.send(ix, &admin).unwrap();

    let meta = f
        .send(f.pause_ix(&pauser.pubkey()), &pauser)
        .expect("pauser pauses");
    assert!(f.config().paused);
    let ev = events::<Paused>(&meta);
    assert_eq!(ev.len(), 1);
    assert_eq!(ev[0].by, pauser.pubkey());
    assert_eq!(ev[0].config, f.pdas.config);
    let cu = events::<ConfigUpdated>(&meta);
    assert_eq!(cu.len(), 1);
    assert_eq!(cu[0].field, field::PAUSED);
    assert_eq!((cu[0].old[0], cu[0].new[0]), (0, 1));

    for who in [&admin, &guardian] {
        f.send(f.unpause_ix(&admin.pubkey()), &admin)
            .expect("admin unpauses");
        assert!(!f.config().paused);
        let meta = f.send(f.pause_ix(&who.pubkey()), who).expect("pauses");
        assert!(f.config().paused);
        assert_eq!(events::<Paused>(&meta)[0].by, who.pubkey());
    }
}

#[test]
fn pause_rejects_others() {
    let mut f = Fixture::new();
    let operator = f.operator.insecure_clone();
    let stranger = Keypair::new();
    for s in [&operator, &stranger] {
        assert_mutav_err(f.send(f.pause_ix(&s.pubkey()), s), MutavError::Unauthorized);
    }
    assert!(!f.config().paused);
}

#[test]
fn unpause_admin_only() {
    let mut f = Fixture::new();
    let pauser = f.pauser.insecure_clone();
    let admin = f.admin.insecure_clone();
    let guardian = funded(&mut f);
    let ix = f.set_guardians_ix(
        &admin.pubkey(),
        [guardian.pubkey(), Pubkey::default(), Pubkey::default()],
    );
    f.send(ix, &admin).unwrap();
    f.send(f.pause_ix(&pauser.pubkey()), &pauser).unwrap();

    for s in [&pauser, &guardian] {
        assert_mutav_err(
            f.send(f.unpause_ix(&s.pubkey()), s),
            MutavError::Unauthorized,
        );
    }
    assert!(f.config().paused);

    let meta = f
        .send(f.unpause_ix(&admin.pubkey()), &admin)
        .expect("unpause");
    assert!(!f.config().paused);
    let ev = events::<Unpaused>(&meta);
    assert_eq!(ev.len(), 1);
    assert_eq!(ev[0].by, admin.pubkey());
}

// ===========================================================================
// Guardians
// ===========================================================================

#[test]
fn set_guardians_sets_and_empties_slots() {
    let mut f = Fixture::new();
    let admin = f.admin.insecure_clone();
    let (g0, g1) = (funded(&mut f), funded(&mut f));
    let d = Pubkey::default();

    let ix = f.set_guardians_ix(&admin.pubkey(), [g0.pubkey(), d, g1.pubkey()]);
    let meta = f.send(ix, &admin).expect("set_guardians");
    assert_eq!(f.config().guardians, [g0.pubkey(), d, g1.pubkey()]);
    // One `ConfigUpdated` per changed slot, none for the unchanged empty one.
    assert_eq!(fields(&meta), vec![field::GUARDIAN_0, field::GUARDIAN_2]);
    let ev = events::<GuardiansUpdated>(&meta);
    assert_eq!(ev[0].guardians, [g0.pubkey(), d, g1.pubkey()]);

    // A guardian pauses and does nothing else.
    f.send(f.pause_ix(&g1.pubkey()), &g1)
        .expect("guardian pauses");
    assert_mutav_err(
        f.send(f.revoke_operator_ix(&g1.pubkey()), &g1),
        MutavError::Unauthorized,
    );

    // Emptying a slot removes the power at once.
    f.send(f.unpause_ix(&admin.pubkey()), &admin).unwrap();
    let ix = f.set_guardians_ix(&admin.pubkey(), [g0.pubkey(), d, d]);
    let meta = f.send(ix, &admin).unwrap();
    assert_eq!(fields(&meta), vec![field::GUARDIAN_2]);
    assert_mutav_err(
        f.send(f.pause_ix(&g1.pubkey()), &g1),
        MutavError::Unauthorized,
    );
    // An unchanged call emits no `ConfigUpdated`.
    let ix = f.set_guardians_ix(&admin.pubkey(), [g0.pubkey(), d, d]);
    assert!(fields(&f.send(ix, &admin).unwrap()).is_empty());
}

#[test]
fn set_guardians_refuses_role_keys_and_repeats() {
    let mut f = Fixture::new();
    let admin = f.admin.insecure_clone();
    let c = f.config();
    let g = Pubkey::new_unique();
    let d = Pubkey::default();
    for keys in [
        [c.admin, d, d],
        [d, c.operator, d],
        [d, d, c.pauser],
        [g, d, g],
    ] {
        let ix = f.set_guardians_ix(&admin.pubkey(), keys);
        assert_mutav_err(f.send(ix, &admin), MutavError::RolesNotDistinct);
    }
    assert_eq!(f.config().guardians, [d; 3]);
}

// ===========================================================================
// Operator and pauser handover
// ===========================================================================

#[test]
fn operator_handover_in_two_steps() {
    let mut f = Fixture::new();
    let old = f.operator.pubkey();
    let new = funded(&mut f);
    let now = clock(&f.svm).unix_timestamp;

    let meta = propose(&mut f, ROLE_OPERATOR, new.pubkey()).expect("propose");
    let c = f.config();
    assert_eq!(c.pending_operator, new.pubkey());
    assert_eq!(c.pending_operator_expires_at, now + HANDOVER_WINDOW_SECS);
    assert_eq!(c.operator, old, "nothing changes until accepted");
    assert_eq!(fields(&meta), vec![field::PENDING_OPERATOR]);
    let ev = events::<RoleProposed>(&meta);
    assert_eq!(
        (ev[0].role, ev[0].key, ev[0].expires_at),
        (ROLE_OPERATOR, new.pubkey(), now + HANDOVER_WINDOW_SECS)
    );

    let meta = accept(&mut f, ROLE_OPERATOR, &new).expect("accept");
    let c = f.config();
    assert_eq!(c.operator, new.pubkey());
    assert_eq!(
        (c.pending_operator, c.pending_operator_expires_at),
        (Pubkey::default(), 0)
    );
    assert_eq!(
        fields(&meta),
        vec![field::PENDING_OPERATOR, field::OPERATOR]
    );
    let ev = events::<RoleAccepted>(&meta);
    assert_eq!(
        (ev[0].role, ev[0].old, ev[0].new),
        (ROLE_OPERATOR, old, new.pubkey())
    );
    assert!(c.is_operator(&new.pubkey()) && !c.is_operator(&old));
    // A second accept finds nothing pending.
    assert_mutav_err(
        accept(&mut f, ROLE_OPERATOR, &new),
        MutavError::NoPendingHandover,
    );
}

#[test]
fn pauser_handover_in_two_steps() {
    let mut f = Fixture::new();
    let old = f.pauser.insecure_clone();
    let new = funded(&mut f);
    propose(&mut f, ROLE_PAUSER, new.pubkey()).unwrap();
    let meta = accept(&mut f, ROLE_PAUSER, &new).expect("accept");
    assert_eq!(f.config().pauser, new.pubkey());
    assert_eq!(fields(&meta), vec![field::PENDING_PAUSER, field::PAUSER]);
    assert_mutav_err(
        f.send(f.pause_ix(&old.pubkey()), &old),
        MutavError::Unauthorized,
    );
    f.send(f.pause_ix(&new.pubkey()), &new).expect("new pauser");
}

#[test]
fn accept_rules() {
    let mut f = Fixture::new();
    let new = funded(&mut f);
    let other = funded(&mut f);

    // Nothing pending.
    assert_mutav_err(
        accept(&mut f, ROLE_OPERATOR, &new),
        MutavError::NoPendingHandover,
    );
    propose(&mut f, ROLE_OPERATOR, new.pubkey()).unwrap();
    // Only the proposed key, and only for its role.
    assert_mutav_err(
        accept(&mut f, ROLE_OPERATOR, &other),
        MutavError::Unauthorized,
    );
    assert_mutav_err(
        accept(&mut f, ROLE_PAUSER, &new),
        MutavError::NoPendingHandover,
    );
    // Unknown roles (zero is never a role); the admin handover has its own
    // instruction.
    for role in [0, ROLE_ADMIN, 4, u8::MAX] {
        assert_mutav_err(accept(&mut f, role, &new), MutavError::InvalidParameter);
    }
    // At the expiry second it still accepts; one second later it does not.
    let exp = f.config().pending_operator_expires_at;
    set_time(&mut f.svm, exp + 1);
    assert_mutav_err(
        accept(&mut f, ROLE_OPERATOR, &new),
        MutavError::HandoverExpired,
    );
    set_time(&mut f.svm, exp);
    accept(&mut f, ROLE_OPERATOR, &new).expect("accept at expiry");
}

#[test]
fn propose_rules() {
    let mut f = Fixture::new();
    let c = f.config();
    let admin = f.admin.insecure_clone();
    let g = Pubkey::new_unique();
    let ix = f.set_guardians_ix(&admin.pubkey(), [g, Pubkey::default(), Pubkey::default()]);
    f.send(ix, &admin).unwrap();

    for role in [0, ROLE_ADMIN, 4, u8::MAX] {
        assert_mutav_err(
            propose(&mut f, role, Pubkey::new_unique()),
            MutavError::InvalidParameter,
        );
    }
    for role in [ROLE_OPERATOR, ROLE_PAUSER] {
        assert_mutav_err(
            propose(&mut f, role, Pubkey::default()),
            MutavError::InvalidParameter,
        );
        assert_mutav_err(propose(&mut f, role, c.admin), MutavError::RolesNotDistinct);
        assert_mutav_err(propose(&mut f, role, g), MutavError::RolesNotDistinct);
    }
    assert_mutav_err(
        propose(&mut f, ROLE_OPERATOR, c.pauser),
        MutavError::RolesNotDistinct,
    );
    assert_mutav_err(
        propose(&mut f, ROLE_PAUSER, c.operator),
        MutavError::RolesNotDistinct,
    );

    // While a handover waits, a new proposal is refused: the admin cancels
    // first (both can be in one proposal). An expired one is replaced.
    let (a, b, c2) = (funded(&mut f), funded(&mut f), funded(&mut f));
    propose(&mut f, ROLE_OPERATOR, a.pubkey()).unwrap();
    assert_mutav_err(
        propose(&mut f, ROLE_OPERATOR, b.pubkey()),
        MutavError::HandoverPending,
    );
    let admin = f.admin.insecure_clone();
    let ixs = [
        f.cancel_pending_ix(&admin.pubkey(), ROLE_OPERATOR),
        f.propose_role_ix(&admin.pubkey(), ROLE_OPERATOR, b.pubkey()),
    ];
    let payer = f.payer.insecure_clone();
    send_ixs(&mut f.svm, &ixs, &[&payer, &admin]).expect("cancel + propose");
    assert_mutav_err(accept(&mut f, ROLE_OPERATOR, &a), MutavError::Unauthorized);
    let exp = f.config().pending_operator_expires_at;
    set_time(&mut f.svm, exp + 1);
    propose(&mut f, ROLE_OPERATOR, c2.pubkey()).expect("expired: replaced");
    assert_mutav_err(accept(&mut f, ROLE_OPERATOR, &b), MutavError::Unauthorized);
    accept(&mut f, ROLE_OPERATOR, &c2).expect("latest proposal");
}

#[test]
fn accept_re_checks_the_roles_of_now() {
    let mut f = Fixture::new();
    let admin = f.admin.insecure_clone();
    let x = funded(&mut f);
    // The same key proposed for both roles: the first accept wins, the
    // second is refused.
    propose(&mut f, ROLE_OPERATOR, x.pubkey()).unwrap();
    propose(&mut f, ROLE_PAUSER, x.pubkey()).unwrap();
    accept(&mut f, ROLE_OPERATOR, &x).unwrap();
    assert_mutav_err(
        accept(&mut f, ROLE_PAUSER, &x),
        MutavError::RolesNotDistinct,
    );

    // A key made a guardian after its proposal cannot accept.
    let y = funded(&mut f);
    let ix = f.cancel_pending_ix(&admin.pubkey(), ROLE_PAUSER);
    f.send(ix, &admin).unwrap();
    propose(&mut f, ROLE_PAUSER, y.pubkey()).unwrap();
    let ix = f.set_guardians_ix(
        &admin.pubkey(),
        [y.pubkey(), Pubkey::default(), Pubkey::default()],
    );
    f.send(ix, &admin).unwrap();
    assert_mutav_err(
        accept(&mut f, ROLE_PAUSER, &y),
        MutavError::RolesNotDistinct,
    );
}

#[test]
fn a_new_operator_may_not_own_a_money_account() {
    // The payments account's owner as the next operator.
    let mut f = Fixture::new();
    let k = funded(&mut f);
    let admin = f.admin.insecure_clone();
    let treasury = f.config().treasury_account;
    let owned = f.token_account(&k.pubkey());
    let ix = f.set_payments_account_ix(&admin.pubkey(), &owned, &treasury);
    f.send(ix, &admin).unwrap();
    propose(&mut f, ROLE_OPERATOR, k.pubkey()).unwrap();
    assert_mutav_err(
        accept(&mut f, ROLE_OPERATOR, &k),
        MutavError::InvalidPaymentsAccount,
    );
    // A pauser may own one: the rule is about the operator.
    propose(&mut f, ROLE_PAUSER, k.pubkey()).unwrap();
    accept(&mut f, ROLE_PAUSER, &k).expect("pauser");

    // The treasury's owner likewise.
    let mut f = Fixture::new();
    let k = funded(&mut f);
    let admin = f.admin.insecure_clone();
    let owned = f.token_account(&k.pubkey());
    let ix = f.set_treasury_account_ix(&admin.pubkey(), &owned);
    f.send(ix, &admin).unwrap();
    propose(&mut f, ROLE_OPERATOR, k.pubkey()).unwrap();
    assert_mutav_err(
        accept(&mut f, ROLE_OPERATOR, &k),
        MutavError::InvalidTreasuryAccount,
    );
}

#[test]
fn cancel_pending_clears_a_handover() {
    let mut f = Fixture::new();
    let admin = f.admin.insecure_clone();
    let a = admin.pubkey();
    let x = funded(&mut f);

    for role in [ROLE_OPERATOR, ROLE_PAUSER, ROLE_ADMIN] {
        assert_mutav_err(
            f.send(f.cancel_pending_ix(&a, role), &admin),
            MutavError::NoPendingHandover,
        );
    }
    for role in [0, 4, u8::MAX] {
        assert_mutav_err(
            f.send(f.cancel_pending_ix(&a, role), &admin),
            MutavError::InvalidParameter,
        );
    }

    propose(&mut f, ROLE_PAUSER, x.pubkey()).unwrap();
    let meta = f
        .send(f.cancel_pending_ix(&a, ROLE_PAUSER), &admin)
        .expect("cancel");
    let c = f.config();
    assert_eq!(
        (c.pending_pauser, c.pending_pauser_expires_at),
        (Pubkey::default(), 0)
    );
    assert_eq!(fields(&meta), vec![field::PENDING_PAUSER]);
    let ev = events::<HandoverCancelled>(&meta);
    assert_eq!((ev[0].role, ev[0].key), (ROLE_PAUSER, x.pubkey()));
    assert_mutav_err(
        accept(&mut f, ROLE_PAUSER, &x),
        MutavError::NoPendingHandover,
    );

    // The admin handover too.
    let ix = f.propose_admin_ix(&a, x.pubkey());
    f.send(ix, &admin).unwrap();
    f.send(f.cancel_pending_ix(&a, ROLE_ADMIN), &admin).unwrap();
    assert_mutav_err(
        f.send(f.accept_admin_ix(&x.pubkey()), &x),
        MutavError::NoPendingHandover,
    );
}

// ===========================================================================
// Admin handover
// ===========================================================================

#[test]
fn admin_handover_in_two_steps() {
    let mut f = Fixture::new();
    let old = f.admin.insecure_clone();
    let new = funded(&mut f);
    let stranger = funded(&mut f);
    let c = f.config();

    for bad in [Pubkey::default()] {
        let ix = f.propose_admin_ix(&old.pubkey(), bad);
        assert_mutav_err(f.send(ix, &old), MutavError::InvalidParameter);
    }
    for bad in [c.operator, c.pauser] {
        let ix = f.propose_admin_ix(&old.pubkey(), bad);
        assert_mutav_err(f.send(ix, &old), MutavError::RolesNotDistinct);
    }

    let ix = f.propose_admin_ix(&old.pubkey(), new.pubkey());
    let meta = f.send(ix, &old).expect("propose_admin");
    assert_eq!(fields(&meta), vec![field::PENDING_ADMIN]);
    assert_eq!(events::<RoleProposed>(&meta)[0].role, ROLE_ADMIN);
    assert_mutav_err(
        f.send(f.accept_admin_ix(&stranger.pubkey()), &stranger),
        MutavError::Unauthorized,
    );
    let exp = f.config().pending_admin_expires_at;
    set_time(&mut f.svm, exp + 1);
    assert_mutav_err(
        f.send(f.accept_admin_ix(&new.pubkey()), &new),
        MutavError::HandoverExpired,
    );
    set_time(&mut f.svm, exp);
    let meta = f
        .send(f.accept_admin_ix(&new.pubkey()), &new)
        .expect("accept_admin");
    let c = f.config();
    assert_eq!(c.admin, new.pubkey());
    assert_eq!(c.pending_admin, Pubkey::default());
    assert_eq!(fields(&meta), vec![field::PENDING_ADMIN, field::ADMIN]);
    let ev = events::<RoleAccepted>(&meta);
    assert_eq!(
        (ev[0].role, ev[0].old, ev[0].new),
        (ROLE_ADMIN, old.pubkey(), new.pubkey())
    );

    // The old admin has no power left; the new one has it all.
    let ix = f.set_config_ix(&old.pubkey(), vec![ConfigParam::MaxTvl(1)]);
    assert_mutav_err(f.send(ix, &old), MutavError::Unauthorized);
    let ix = f.set_config_ix(&new.pubkey(), vec![ConfigParam::MaxTvl(1)]);
    f.send(ix, &new).expect("new admin");
    f.send(f.pause_ix(&new.pubkey()), &new).unwrap();
    f.send(f.unpause_ix(&new.pubkey()), &new).unwrap();
}

// ===========================================================================
// revoke_operator
// ===========================================================================

#[test]
fn revoke_operator_until_a_new_operator_accepts() {
    let mut f = Fixture::new();
    let pauser = f.pauser.insecure_clone();
    let admin = f.admin.insecure_clone();
    let old_operator = f.operator.pubkey();
    // Pending keys proposed before the incident.
    let (stale_op, stale_pa) = (funded(&mut f), funded(&mut f));
    propose(&mut f, ROLE_OPERATOR, stale_op.pubkey()).unwrap();
    propose(&mut f, ROLE_PAUSER, stale_pa.pubkey()).unwrap();
    let new_admin = Pubkey::new_unique();
    let ix = f.propose_admin_ix(&admin.pubkey(), new_admin);
    f.send(ix, &admin).unwrap();

    let meta = f
        .send(f.revoke_operator_ix(&pauser.pubkey()), &pauser)
        .expect("pauser revokes");
    let c = f.config();
    assert_eq!(c.operator, Pubkey::default());
    assert!(!c.is_operator(&old_operator));
    assert!(!c.is_operator(&Pubkey::default()));
    // The pending operator key is cleared; the pending pauser and admin
    // keys are not (a doubtful pauser cannot cancel its own replacement).
    assert_eq!(
        (c.pending_operator, c.pending_operator_expires_at),
        (Pubkey::default(), 0)
    );
    assert_eq!(c.pending_pauser, stale_pa.pubkey());
    assert_eq!(c.pending_admin, new_admin);
    let ev = events::<OperatorRevoked>(&meta);
    assert_eq!(ev.len(), 1);
    assert_eq!(ev[0].by, pauser.pubkey());
    assert_eq!(
        fields(&meta),
        vec![field::OPERATOR, field::PENDING_OPERATOR]
    );
    let cu = events::<ConfigUpdated>(&meta);
    assert_eq!(cu[0].old, old_operator.to_bytes());
    assert_eq!(cu[0].new, [0; 32]);
    assert_mutav_err(
        accept(&mut f, ROLE_OPERATOR, &stale_op),
        MutavError::NoPendingHandover,
    );
    let ix = f.cancel_pending_ix(&admin.pubkey(), ROLE_PAUSER);
    f.send(ix, &admin).unwrap();

    // Still revoked after unrelated admin actions; operator instructions
    // are refused.
    f.send(f.set_allowlist_root_ix(&admin.pubkey(), [9; 32]), &admin)
        .unwrap();
    assert!(!f.config().is_operator(&old_operator));
    let (res, _) = f.contribute(1_000 * BRL);
    assert_mutav_err(res, MutavError::Unauthorized);

    // A pauser can be handed over while the operator is revoked.
    let next_pauser = funded(&mut f);
    f.handover(ROLE_PAUSER, &next_pauser)
        .expect("pauser handover");
    // Only a new operator's acceptance restores operator instructions.
    let new_operator = funded(&mut f);
    f.handover(ROLE_OPERATOR, &new_operator).expect("handover");
    assert!(f.config().is_operator(&new_operator.pubkey()));
    f.operator = new_operator;
    let (res, _) = f.contribute(1_000 * BRL);
    res.expect("new operator contributes");
}

#[test]
fn revoke_operator_by_admin_and_not_others() {
    let mut f = Fixture::new();
    let operator = f.operator.insecure_clone();
    let stranger = Keypair::new();
    for s in [&operator, &stranger] {
        assert_mutav_err(
            f.send(f.revoke_operator_ix(&s.pubkey()), s),
            MutavError::Unauthorized,
        );
    }
    assert_eq!(f.config().operator, operator.pubkey());

    let admin = f.admin.insecure_clone();
    f.send(f.revoke_operator_ix(&admin.pubkey()), &admin)
        .expect("admin revokes");
    assert_eq!(f.config().operator, Pubkey::default());
}

#[test]
fn set_allowlist_root_emits() {
    let mut f = Fixture::new();
    let admin = f.admin.insecure_clone();
    let meta = f
        .send(f.set_allowlist_root_ix(&admin.pubkey(), [7; 32]), &admin)
        .expect("set root");
    assert_eq!(f.config().investor_allowlist_root, [7; 32]);
    let ev = events::<mutav::events::AllowlistRootUpdated>(&meta);
    assert_eq!(ev.len(), 1);
    assert_eq!(ev[0].root, [7; 32]);
}

// ===========================================================================
// revoke_pauser and the pauser handover during an incident
// ===========================================================================

#[test]
fn a_doubtful_pauser_cannot_cancel_its_own_replacement() {
    // The admin proposes a new pauser; the old pauser revokes the operator
    // in between. The pauser handover still completes.
    let mut f = Fixture::new();
    let old = f.pauser.insecure_clone();
    let new = funded(&mut f);
    propose(&mut f, ROLE_PAUSER, new.pubkey()).unwrap();
    f.send(f.revoke_operator_ix(&old.pubkey()), &old)
        .expect("old pauser revokes the operator");
    assert_eq!(f.config().pending_pauser, new.pubkey());
    accept(&mut f, ROLE_PAUSER, &new).expect("handover completes");
    assert_eq!(f.config().pauser, new.pubkey());
    assert_mutav_err(
        f.send(f.pause_ix(&old.pubkey()), &old),
        MutavError::Unauthorized,
    );
}

#[test]
fn revoke_pauser_removes_the_pauser_at_once() {
    let mut f = Fixture::new();
    let admin = f.admin.insecure_clone();
    let old = f.pauser.insecure_clone();
    let new = funded(&mut f);
    // In one admin proposal: remove the pauser and propose the next one.
    let ixs = [
        f.revoke_pauser_ix(&admin.pubkey()),
        f.propose_role_ix(&admin.pubkey(), ROLE_PAUSER, new.pubkey()),
    ];
    let payer = f.payer.insecure_clone();
    let meta = send_ixs(&mut f.svm, &ixs, &[&payer, &admin]).expect("revoke + propose");
    let ev = events::<mutav::events::PauserRevoked>(&meta);
    assert_eq!(ev[0].by, admin.pubkey());
    assert_eq!(f.config().pauser, Pubkey::default());
    for ix in [
        f.pause_ix(&old.pubkey()),
        f.revoke_operator_ix(&old.pubkey()),
    ] {
        assert_mutav_err(f.send(ix, &old), MutavError::Unauthorized);
    }
    // The admin still pauses; the new pauser takes over.
    f.send(f.pause_ix(&admin.pubkey()), &admin).unwrap();
    accept(&mut f, ROLE_PAUSER, &new).expect("new pauser");
    f.send(f.unpause_ix(&admin.pubkey()), &admin).unwrap();
    f.send(f.pause_ix(&new.pubkey()), &new)
        .expect("new pauser pauses");

    // A pending pauser is cleared by `revoke_pauser`; only the admin calls it.
    let next = funded(&mut f);
    propose(&mut f, ROLE_PAUSER, next.pubkey()).unwrap();
    for k in [&new, &f.operator.insecure_clone(), &next] {
        assert_mutav_err(
            f.send(f.revoke_pauser_ix(&k.pubkey()), k),
            MutavError::Unauthorized,
        );
    }
    let meta = f.send(f.revoke_pauser_ix(&admin.pubkey()), &admin).unwrap();
    assert_eq!(fields(&meta), vec![field::PAUSER, field::PENDING_PAUSER]);
    let c = f.config();
    assert_eq!(
        (c.pauser, c.pending_pauser),
        (Pubkey::default(), Pubkey::default())
    );
    assert_mutav_err(
        accept(&mut f, ROLE_PAUSER, &next),
        MutavError::NoPendingHandover,
    );
}
