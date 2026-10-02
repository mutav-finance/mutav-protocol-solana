//! Fixed-point math (stub).
//!
//! Planned: `u128` `mul_div` with explicit rounding modes (floor for amounts
//! paid out, ceil for amounts owed), share/asset conversion and the virtual
//! offset that defends against first-depositor inflation. All arithmetic is
//! checked; `overflow-checks = true` is a backstop, not the mechanism.
