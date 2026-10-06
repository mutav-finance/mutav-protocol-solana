//! Padding (spec §14.2 R4, R6; §14.7 items 4 and 5): every `init` leaves
//! `_reserved` all zero, and bytes a newer binary may have written into
//! `_reserved` survive every instruction (accounts are updated in place).

use mutav::{
    constants::{MAX_ADAPTERS, PROGRAM_LAYOUT_VERSION},
    state::VaultConfig,
};
use mutav_tests::helpers::*;

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
    c._reserved.copy_from_slice(&noise(seed, 512));
    c.caps._reserved.copy_from_slice(&noise(seed + 1, 32));
    c.price._reserved.copy_from_slice(&noise(seed + 2, 32));
    c.exit._reserved.copy_from_slice(&noise(seed + 3, 32));
    for (i, a) in c.adapters.iter_mut().enumerate() {
        a._reserved
            .copy_from_slice(&noise(seed + 10 + i as u64, 64));
    }
    f.write_config(&c);
    let mut s = f.state();
    s._reserved.copy_from_slice(&noise(seed + 100, 256));
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
    assert_eq!(f.state()._reserved, [0; 256]);

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
    // Raw-byte check, independent of the struct decode: the last 512 bytes of
    // `VaultConfig` and the last 256 of `VaultState` are the `_reserved`
    // arrays, and the injected noise sits exactly there.
    let mut f = Fixture::new();
    inject_noise(&mut f, 42);
    let c = f.raw(&f.pdas.config);
    assert_eq!(&c[c.len() - 512..], noise(42, 512).as_slice());
    let s = f.raw(&f.pdas.state);
    assert_eq!(&s[s.len() - 256..], noise(142, 256).as_slice());
}
