//! Version guard (spec §14.2 R1b, §14.7 item 8): every instruction refuses a
//! program-owned account whose `version` is newer than this binary's
//! `PROGRAM_LAYOUT_VERSION` (or whose status/mode it does not know) with
//! `UnsupportedVersion`, instead of misreading it.
//!
//! Today only `VaultConfig` is read by an instruction. `VaultState`'s guard
//! (version and unknown `mode`) is unit-tested in `state/state.rs`; its
//! LiteSVM test lands with the first instruction that reads it (Task 3).

use mutav::{constants::PROGRAM_LAYOUT_VERSION, errors::MutavError};
use mutav_tests::helpers::*;

#[test]
fn every_instruction_refuses_a_newer_config_layout() {
    let names: Vec<&str> = {
        let mut f = Fixture::new();
        f.pilot_instructions().iter().map(|(n, _, _)| *n).collect()
    };
    for (i, name) in names.iter().enumerate() {
        for version in [PROGRAM_LAYOUT_VERSION + 1, u8::MAX] {
            let mut f = Fixture::new();
            let ixs = f.pilot_instructions();
            // Run the earlier instructions so this one is valid (e.g. unpause
            // after pause), then inject the newer version.
            for (_, ix, signer) in &ixs[..i] {
                f.send(ix.clone(), signer).expect("prefix");
            }
            let mut c = f.config();
            c.version = version;
            f.write_config(&c);
            let before = f.raw(&f.pdas.config);

            let (_, ix, signer) = &ixs[i];
            let res = f.send(ix.clone(), signer);
            assert!(res.is_err(), "{name} accepted version {version}");
            assert_mutav_err(res, MutavError::UnsupportedVersion);
            assert_eq!(f.raw(&f.pdas.config), before, "{name} wrote the account");
        }
    }
}

#[test]
fn the_current_version_is_accepted() {
    let mut f = Fixture::new();
    for (name, ix, signer) in f.pilot_instructions() {
        f.send(ix, &signer)
            .unwrap_or_else(|e| panic!("{name}: {:?}", e.err));
    }
}
