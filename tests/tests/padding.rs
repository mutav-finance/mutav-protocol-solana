//! Padding (spec §14.2 R4, R6; §14.7 items 4 and 5): every `init` leaves
//! `_reserved` all zero, and bytes a newer binary may have written into
//! `_reserved` survive every instruction (accounts are updated in place).

use mutav::{constants::PROGRAM_LAYOUT_VERSION, state::VaultConfig};
use mutav_tests::helpers::*;

/// Top-level `_reserved` length of `VaultConfig` and `VaultState`.
const CONFIG_PAD: usize = 512;
const STATE_PAD: usize = 256;

/// Every `_reserved` region of `VaultConfig`, top-level and nested.
fn config_padding(c: &VaultConfig) -> Vec<Vec<u8>> {
    vec![c._reserved.to_vec(), c.caps._reserved.to_vec()]
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
    assert_eq!(config_padding(&c).len(), 2);
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
fn request_padding_is_zero_at_init_and_preserved() {
    let mut f = Fixture::new();
    let a = f.investor(20_000 * BRL);
    let list = f.allowlist(&[a.pubkey()]);
    let (r, d) = f.request_deposit(&a, &list, 5_000 * BRL);
    r.unwrap();
    let config = f.pdas.config;
    let dep = deposit_pda(&config, d);
    // Zero at init.
    let raw = f.raw(&dep);
    assert_eq!(&raw[raw.len() - 64..], &[0; 64]);

    // Preserved by fulfil (in-place update).
    let tail = |f: &mut Fixture, addr: &anchor_lang::prelude::Pubkey, seed: u64, pad: usize| {
        let mut raw = f.raw(addr);
        let n = raw.len();
        raw[n - pad..].copy_from_slice(&noise(seed, pad));
        f.write_raw(addr, &raw);
    };
    tail(&mut f, &dep, 1, 64);
    f.fulfil_deposits(1, &[d]).unwrap();
    let raw = f.raw(&dep);
    assert_eq!(&raw[raw.len() - 64..], noise(1, 64).as_slice());
    f.claim_shares(&a, d).unwrap();

    let (r, seq) = f.request_redeem(&a, &list, 2_000 * BRL);
    r.unwrap();
    let red = redeem_pda(&config, seq);
    // `RedeemRequest` keeps 56 bytes of padding after `shares_filled` (ADR 0019).
    let raw = f.raw(&red);
    assert_eq!(&raw[raw.len() - 56..], &[0; 56]);
    tail(&mut f, &red, 3, 56);
    f.fulfil_redeems(1, u64::MAX, &[seq]).unwrap();
    let raw = f.raw(&red);
    assert_eq!(&raw[raw.len() - 56..], noise(3, 56).as_slice());
}

#[test]
fn income_receipt_padding_is_zero_at_init_and_never_written() {
    let mut f = Fixture::new();
    let r = f.pay_and_sweep(1_000 * BRL);
    let raw = f.raw(&income_receipt_pda(&f.pdas.config, &r));
    assert_eq!(raw.len(), mutav::constants::INCOME_RECEIPT_SIZE);
    assert_eq!(&raw[raw.len() - 64..], &[0; 64]);
    let receipt = f.income_receipt(&r);
    assert_eq!(receipt._reserved, [0; 64]);
    assert_eq!(receipt.kind, mutav::constants::INCOME_KIND_ISSUER_STATEMENT);
}
