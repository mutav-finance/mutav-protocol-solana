//! Padding (spec §14.2 R4, R6; §14.7 items 4 and 5): every `init` leaves
//! `_reserved` all zero, and bytes a newer binary may have written into
//! `_reserved` survive every instruction (accounts are updated in place).

use mutav::{
    constants::{MAX_ADAPTERS, PROGRAM_LAYOUT_VERSION},
    state::VaultConfig,
};
use mutav_tests::helpers::*;

/// Top-level `_reserved` length of `VaultConfig` and `VaultState`.
const CONFIG_PAD: usize = 518;
const STATE_PAD: usize = 236;

/// Every `_reserved` region of `VaultConfig`, top-level and nested.
fn config_padding(c: &VaultConfig) -> Vec<Vec<u8>> {
    let mut out = vec![
        c._reserved.to_vec(),
        c.caps._reserved.to_vec(),
        c.price._reserved.to_vec(),
        c.exit._reserved.to_vec(),
    ];
    out.extend(c.adapters.iter().map(|a| a._reserved.to_vec()));
    out
}

/// Deterministic pseudo-random bytes (xorshift), never all zero.
fn noise(seed: u64, n: usize) -> Vec<u8> {
    let mut x = seed | 1;
    (0..n)
        .map(|_| {
            x ^= x << 13;
            x ^= x >> 7;
            x ^= x << 17;
            (x >> 24) as u8 | 1
        })
        .collect()
}

fn inject_noise(f: &mut Fixture, seed: u64) {
    let mut c = f.config();
    c._reserved.copy_from_slice(&noise(seed, CONFIG_PAD));
    let n = c.caps._reserved.len();
    c.caps._reserved.copy_from_slice(&noise(seed + 1, n));
    c.price._reserved.copy_from_slice(&noise(seed + 2, 32));
    c.exit._reserved.copy_from_slice(&noise(seed + 3, 32));
    for (i, a) in c.adapters.iter_mut().enumerate() {
        a._reserved
            .copy_from_slice(&noise(seed + 10 + i as u64, 62));
    }
    f.write_config(&c);
    let mut s = f.state();
    s._reserved.copy_from_slice(&noise(seed + 100, STATE_PAD));
    f.write_state(&s);
}

#[test]
fn init_leaves_padding_zero() {
    let f = Fixture::new();
    let c = f.config();
    for (i, pad) in config_padding(&c).iter().enumerate() {
        assert!(pad.iter().all(|b| *b == 0), "config padding region {i}");
    }
    assert_eq!(config_padding(&c).len(), 4 + MAX_ADAPTERS);
    assert_eq!(f.state()._reserved, [0; STATE_PAD]);

    // `VaultState` starts empty: after the discriminator, only `version` and
    // `bump` are non-zero.
    let raw = f.raw(&f.pdas.state);
    assert_eq!(raw[8], PROGRAM_LAYOUT_VERSION);
    assert!(raw[10..].iter().all(|b| *b == 0), "state not empty at init");
}

#[test]
fn padding_survives_every_instruction() {
    let mut f = Fixture::new();
    inject_noise(&mut f, 0x5eed);
    let config_before = config_padding(&f.config());
    let state_before = f.state()._reserved;

    for (name, ix, signer) in f.pilot_instructions() {
        f.send(ix, &signer)
            .unwrap_or_else(|e| panic!("{name}: {:?}", e.err));
        assert_eq!(
            config_padding(&f.config()),
            config_before,
            "{name} changed VaultConfig padding"
        );
        assert_eq!(
            f.state()._reserved,
            state_before,
            "{name} changed VaultState padding"
        );
    }
}

#[test]
fn padding_bytes_are_where_the_layout_says() {
    // Raw-byte check, independent of the struct decode: the last `CONFIG_PAD` bytes of
    // `VaultConfig` and the last `STATE_PAD` of `VaultState` are the `_reserved`
    // arrays (after the carves), and the injected noise sits exactly
    // there.
    let mut f = Fixture::new();
    inject_noise(&mut f, 42);
    let c = f.raw(&f.pdas.config);
    assert_eq!(&c[c.len() - CONFIG_PAD..], noise(42, CONFIG_PAD).as_slice());
    let s = f.raw(&f.pdas.state);
    assert_eq!(&s[s.len() - STATE_PAD..], noise(142, STATE_PAD).as_slice());
}

#[test]
fn request_and_holder_padding_is_zero_at_init_and_preserved() {
    let mut f = Fixture::new();
    let a = f.investor(20_000 * BRL);
    let list = f.allowlist(&[a.pubkey()]);
    let (r, d) = f.request_deposit(&a, &list, 5_000 * BRL);
    r.unwrap();
    let config = f.pdas.config;
    let dep = deposit_pda(&config, d);
    let holder = holder_pda(&config, &a.pubkey());
    // Zero at init.
    let raw = f.raw(&dep);
    assert_eq!(&raw[raw.len() - 64..], &[0; 64]);
    let raw = f.raw(&holder);
    assert_eq!(&raw[raw.len() - 64..], &[0; 64]);

    // Preserved by fulfil (in-place update) and by a holder re-stamp.
    let tail = |f: &mut Fixture, addr: &anchor_lang::prelude::Pubkey, seed: u64| {
        let mut raw = f.raw(addr);
        let n = raw.len();
        raw[n - 64..].copy_from_slice(&noise(seed, 64));
        f.write_raw(addr, &raw);
    };
    tail(&mut f, &dep, 1);
    tail(&mut f, &holder, 2);
    f.fulfil_deposits(1, &[d]).unwrap();
    let raw = f.raw(&dep);
    assert_eq!(&raw[raw.len() - 64..], noise(1, 64).as_slice());
    f.request_deposit(&a, &list, 1_000 * BRL).0.unwrap();
    let raw = f.raw(&holder);
    assert_eq!(&raw[raw.len() - 64..], noise(2, 64).as_slice());
    f.claim_shares(&a, d).unwrap();

    let (r, seq) = f.request_redeem(&a, &list, 2_000 * BRL);
    r.unwrap();
    let red = redeem_pda(&config, seq);
    let raw = f.raw(&red);
    assert_eq!(&raw[raw.len() - 64..], &[0; 64]);
    tail(&mut f, &red, 3);
    f.fulfil_redeems(1, u64::MAX, &[seq]).unwrap();
    let raw = f.raw(&red);
    assert_eq!(&raw[raw.len() - 64..], noise(3, 64).as_slice());
}

#[test]
fn income_receipt_padding_is_zero_at_init_and_never_written() {
    let mut f = Fixture::new();
    let r = f.pay_and_sweep(1_000 * BRL);
    let raw = f.raw(&income_receipt_pda(&f.pdas.config, &r));
    assert_eq!(raw.len(), mutav::constants::INCOME_RECEIPT_SIZE);
    assert_eq!(&raw[raw.len() - 64..], &[0; 64]);
    assert_eq!(f.income_receipt(&r)._reserved, [0; 64]);
}
