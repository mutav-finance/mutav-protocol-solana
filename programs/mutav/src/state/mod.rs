//! Account state. Every program-owned account starts with `version`, `bump`
//! and ends with `_reserved` (spec §14.2).

pub mod config;
pub mod state;

pub use config::*;
pub use state::*;
