//! Roles, pause and operator revocation (spec §2, §5.1).

use anchor_lang::prelude::Pubkey;
use mutav::{
    constants::field,
    errors::MutavError,
    events::{ConfigUpdated, OperatorRevoked, Paused, RolesUpdated, Unpaused},
};
use mutav_tests::helpers::*;
use solana_keypair::Keypair;
use solana_signer::Signer;

#[test]
fn every_admin_instruction_rejects_a_non_admin_signer() {
    let mut f = Fixture::new();
    let args = set_config_args(&f.config());
    let treasury = f.treasury;
    let payments = f.payments;
    let operator = f.operator.insecure_clone();
    let pauser = f.pauser.insecure_clone();
    let stranger = Keypair::new();

    for signer in [&operator, &pauser, &stranger] {
        let k = signer.pubkey();
        let new_payments = f.token_account(&Pubkey::new_unique());
        let ixs = [
            f.set_config_ix(&k, args.clone(), &treasury),
            f.set_roles_ix(&k, Pubkey::new_unique(), Pubkey::new_unique()),
            f.set_payments_account_ix(&k, &new_payments, &treasury),
            f.set_allowlist_root_ix(&k, [1; 32]),
            f.unpause_ix(&k),
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
}

#[test]
fn pause_by_pauser_or_admin() {
    let mut f = Fixture::new();
    let pauser = f.pauser.insecure_clone();
    let admin = f.admin.insecure_clone();

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

    f.send(f.unpause_ix(&admin.pubkey()), &admin)
        .expect("admin unpauses");
    assert!(!f.config().paused);

    let meta = f
        .send(f.pause_ix(&admin.pubkey()), &admin)
        .expect("admin pauses");
    assert!(f.config().paused);
    assert_eq!(events::<Paused>(&meta)[0].by, admin.pubkey());
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
    f.send(f.pause_ix(&pauser.pubkey()), &pauser).unwrap();

    assert_mutav_err(
        f.send(f.unpause_ix(&pauser.pubkey()), &pauser),
        MutavError::Unauthorized,
    );
    assert!(f.config().paused);

    let meta = f
        .send(f.unpause_ix(&admin.pubkey()), &admin)
        .expect("unpause");
    assert!(!f.config().paused);
    let ev = events::<Unpaused>(&meta);
    assert_eq!(ev.len(), 1);
    assert_eq!(ev[0].by, admin.pubkey());
}

#[test]
fn revoke_operator_until_set_roles() {
    let mut f = Fixture::new();
    let pauser = f.pauser.insecure_clone();
    let admin = f.admin.insecure_clone();
    let old_operator = f.operator.pubkey();

    let meta = f
        .send(f.revoke_operator_ix(&pauser.pubkey()), &pauser)
        .expect("pauser revokes");
    let c = f.config();
    assert_eq!(c.operator, Pubkey::default());
    // Operator instructions check `is_operator`, which no key passes now.
    assert!(!c.is_operator(&old_operator));
    assert!(!c.is_operator(&Pubkey::default()));
    let ev = events::<OperatorRevoked>(&meta);
    assert_eq!(ev.len(), 1);
    assert_eq!(ev[0].by, pauser.pubkey());
    let cu = events::<ConfigUpdated>(&meta);
    assert_eq!(cu.len(), 1);
    assert_eq!(cu[0].field, field::OPERATOR);
    assert_eq!(cu[0].old, old_operator.to_bytes());
    assert_eq!(cu[0].new, [0; 32]);

    // Still revoked after unrelated admin actions.
    f.send(f.set_allowlist_root_ix(&admin.pubkey(), [9; 32]), &admin)
        .unwrap();
    assert!(!f.config().is_operator(&old_operator));

    // Only `set_roles` appoints a new operator.
    let new_operator = Pubkey::new_unique();
    let meta = f
        .send(
            f.set_roles_ix(&admin.pubkey(), new_operator, pauser.pubkey()),
            &admin,
        )
        .expect("set_roles");
    let c = f.config();
    assert!(c.is_operator(&new_operator));
    let ev = events::<RolesUpdated>(&meta);
    assert_eq!(ev.len(), 1);
    assert_eq!(
        (ev[0].operator, ev[0].pauser),
        (new_operator, pauser.pubkey())
    );
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
fn set_roles_requires_distinct_keys() {
    let mut f = Fixture::new();
    let admin = f.admin.insecure_clone();
    let a = admin.pubkey();
    let x = Pubkey::new_unique();
    let y = Pubkey::new_unique();

    for (op, pa) in [(a, y), (x, a), (x, x)] {
        assert_mutav_err(
            f.send(f.set_roles_ix(&a, op, pa), &admin),
            MutavError::RolesNotDistinct,
        );
    }
    for (op, pa) in [(Pubkey::default(), y), (x, Pubkey::default())] {
        assert_mutav_err(
            f.send(f.set_roles_ix(&a, op, pa), &admin),
            MutavError::InvalidParameter,
        );
    }

    let meta = f.send(f.set_roles_ix(&a, x, y), &admin).expect("set_roles");
    let c = f.config();
    assert_eq!((c.operator, c.pauser), (x, y));
    let fields: Vec<u16> = events::<ConfigUpdated>(&meta)
        .iter()
        .map(|e| e.field)
        .collect();
    assert_eq!(fields, vec![field::OPERATOR, field::PAUSER]);
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
