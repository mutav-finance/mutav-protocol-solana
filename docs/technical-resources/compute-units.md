# Compute units

What each `mutav` instruction costs in compute units (CU), and the limits the off-chain composers ask for. The program is built with `opt-level = "z"` (size over speed): the binary is 724,472 bytes instead of 953,256 at `opt-level = 3`, which locks about 1.16 SOL less in ProgramData. In exchange, every instruction costs more CU.

> Measured in LiteSVM on the `opt-level = "z"` and `opt-level = 3` builds of the same source, layout v1. CU figures move with PDA bump searches, which depend on the mint, wallet and request addresses, so the worst cases are ranges over fresh fixtures. A real cluster charges the same CU for the same work.

## The limits that matter

| Limit | Value | Where it applies |
|---|---:|---|
| Default per instruction | 200,000 CU | A transaction without `SetComputeUnitLimit` gets 200,000 CU per top-level instruction (Compute Budget instructions excluded). A Squads `vault_transaction_execute` is one top-level instruction, so the whole proposal runs inside 200,000 CU unless the transaction asks for more. |
| Maximum per transaction | 1,400,000 CU | The most `SetComputeUnitLimit` can request. |

At `opt-level = "z"`, `initialize` through the upgrade multisig (up to 210,469 CU) and a `refresh` + `set_config` + `refresh` proposal (up to 203,548 CU) pass the 200,000 default. A fill of 8 requests through Squads comes within 3,000 CU of it. So every transaction that can come near 200,000 CU now carries an explicit `SetComputeUnitLimit`. No compute-unit price is set, so a higher limit costs no extra fee.

No instruction comes within 30% of the 1,400,000 maximum, the threshold at which the plan falls back to `opt-level = "s"`. The `compute_unit_table` test fails if one does.

## Limits the composers set

Each limit is about 1.5 times the worst case measured at `opt-level = "z"`, rounded up.

| Transaction | Composed by | Worst case (z) | `SetComputeUnitLimit` |
|---|---|---:|---:|
| Squads `vault_transaction_execute`, any proposal | `app/lib/server/squads.ts` (execute); `executeComputeUnitLimit` in every proposal payload from `scripts/devnet/*` and `scripts/release/upgrade-proposal.ts` | 210,469 | 320,000 |
| `initialize`, signed directly | `scripts/devnet/dry-run.ts`, `tests-fork/happy-path.ts`, `app/scripts/seed.ts` (localnet) | 172,946 | 260,000 |
| `fulfil_deposits`, 8 requests | `app/lib/server/compose.ts` (direct, localnet admin) | 148,402 | 225,000 |
| `fulfil_redeems`, 8 requests | `app/lib/server/compose.ts` (direct, localnet admin) | 163,349 | 250,000 |
| `refresh` | `app/lib/server/compose.ts` | 49,753 | 75,000 |
| `set_config`, with `refresh` before and after | `app/lib/server/compose.ts` (direct, localnet admin) | 181,665 | 275,000 |
| `pay_claim` | `app/lib/server/compose.ts` | 60,779 | 120,000 |

`pay_claim` gets about twice its worst case, not 1.5 times: running out of compute must never act as a refusal of a claim payment. The limits live in [`scripts/devnet/lib/compute.ts`](../../scripts/devnet/lib/compute.ts) and in `COMPUTE_UNIT_LIMITS` / `SQUADS_EXECUTE_COMPUTE_UNIT_LIMIT` in [`app/lib/server/compose.ts`](../../app/lib/server/compose.ts). Other direct transactions stay well under 200,000 CU and carry no limit.

A Compute Budget instruction must be top-level: it does nothing inside a vault transaction. So the Squads limit goes on the transaction that sends `vault_transaction_execute`, not into the proposal. The deploy scripts write proposals as payloads for members to create in the admin console or the Squads app. Each payload names `executeComputeUnitLimit`, and whoever executes it puts `SetComputeUnitLimit(executeComputeUnitLimit)` first in the execute transaction. The pilot app's relay already accepts Compute Budget instructions.

## Worst cases

Fresh fixtures for each sample: 12 per row for direct calls, 6 for calls through Squads. Ranges are min to max.

| Call | opt-level 3 | opt-level z | Max change |
|---|---:|---:|---:|
| `initialize` (classic SPL Token reserve mint) | 96,608–125,108 | 145,946–172,946 | +38% |
| `fulfil_deposits`, 8 whole fills | 77,210–99,731 | 127,402–148,402 | +49% |
| `fulfil_redeems`, 8 whole fills | 89,345–111,845 | 146,919–163,349 | +46% |
| `refresh`, after the redeem fills | 23,649–37,149 | 37,753–49,753 | +34% |
| `set_config`, every field changed | 41,173 | 80,498–80,568 | +96% |
| `refresh` + `set_config` (every field) + `refresh`, one transaction | 84,142–99,142 | 151,665–181,665 | +83% |
| `approve_claim`, above `max_claim_per_call` | 13,729 | 24,140 | +76% |
| `pay_claim`, approved above `max_claim_per_call` | 32,124–35,124 | 51,709–60,779 | +73% |

"Every field" is every settable `set_config` field changed at once, except `feature_flags`, which has no supported bit and is listed at its current value.

### Through Squads v4 `vault_transaction_execute`

The whole execute transaction, with the vault as the inner instructions' signer: the upgrade authority and payer for `initialize`, `VaultConfig.admin` for the rest. Squads adds about 25,000 to 60,000 CU on top of the inner instructions, growing with the number of accounts.

| Call | opt-level 3 | opt-level z | Max change |
|---|---:|---:|---:|
| `initialize`, through the upgrade multisig | 145,546–162,046 | 192,469–210,469 | +30% |
| `fulfil_deposits`, 8 whole fills | 121,049–134,549 | 172,741–178,741 | +33% |
| `fulfil_redeems`, 8 whole fills | 138,048–154,548 | 189,552–197,052 | +28% |
| `refresh` + `set_config` (every field) + `refresh` | 130,025–148,025 | 191,548–203,548 | +38% |
| `approve_claim` | 37,783 | 48,194 | +28% |

## Every instruction

One call of each instruction, in the order the pilot instruction list runs them on one fixture (the larger figure where a name runs twice). These are typical calls, not worst cases.

| Instruction | opt-level 3 | opt-level z | Change |
|---|---:|---:|---:|
| `accept_admin` | 14,027 | 26,191 | +87% |
| `accept_role` | 15,466 | 28,300 | +83% |
| `advance_queue_head` | 15,301 | 30,207 | +97% |
| `approve_claim` | 13,729 | 24,140 | +76% |
| `cancel_deposit` | 43,872 | 60,134 | +37% |
| `cancel_pending` | 11,764 | 21,550 | +83% |
| `cancel_redeem` | 39,357 | 52,760 | +34% |
| `claim_assets` | 44,933 | 59,855 | +33% |
| `claim_shares` | 30,233 | 37,266 | +23% |
| `close_guarantee` | 17,800 | 31,300 | +76% |
| `contribute_fees` | 32,382 | 51,403 | +59% |
| `file_claim` | 23,178 | 41,078 | +77% |
| `fulfil_deposits`, 2 slots (1 cancelled) | 36,336 | 57,203 | +57% |
| `fulfil_redeems`, 2 slots (1 cancelled) | 43,757 | 66,549 | +52% |
| `pause` | 11,728 | 21,761 | +86% |
| `pay_claim` | 33,621 | 51,707 | +54% |
| `propose_admin` | 12,094 | 22,198 | +84% |
| `propose_role` | 12,109 | 22,151 | +83% |
| `refresh` | 24,856 | 37,462 | +51% |
| `register_guarantee` | 24,188 | 39,906 | +65% |
| `request_deposit` | 28,413 | 49,707 | +75% |
| `request_redeem` | 31,074 | 51,221 | +65% |
| `revoke_operator` | 11,739 | 21,835 | +86% |
| `revoke_pauser` | 11,736 | 21,515 | +83% |
| `set_allowlist_root` | 11,761 | 21,684 | +84% |
| `set_config`, 2 fields | 20,975 | 35,609 | +70% |
| `set_guardians` | 12,397 | 23,168 | +87% |
| `set_payments_account` | 15,193 | 25,991 | +71% |
| `set_treasury_account` | 15,192 | 26,032 | +71% |
| `settle_payout` | 12,212 | 22,706 | +86% |
| `sweep_income` | 40,770 | 61,001 | +50% |
| `unpause` | 11,718 | 21,742 | +86% |

The simplest instructions roughly double, because Anchor's account checks and the `emit_cpi!` event self-CPI cost a fixed amount per instruction and are slower at `opt-level = "z"`. Token CPIs run in the token programs, whose cost does not change, so instructions with transfers grow less.

## Reproduce

```text
anchor build --ignore-keys
RUST_TEST_THREADS=4 cargo test -p mutav-tests --test compute -- --nocapture
```

`compute_unit_table` prints the "Worst cases" and "Every instruction" tables. For the Squads table, the test needs the Squads v4 program binary, which the repo does not vendor:

```text
solana program dump -u m SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf /tmp/squads_v4.so
SQUADS_V4_SO=/tmp/squads_v4.so cargo test -p mutav-tests --test compute -- --ignored --nocapture
```

For the `opt-level = 3` column, remove `opt-level = "z"` from `[profile.release]` in the root `Cargo.toml`, rebuild and run the same commands. Figures in this page come from Squads v4 as deployed on mainnet on 2026-10-11 (binary SHA-256 `dec8d3e0…a01d34c`).

## Related pages

- [Deployment and operations](deployment-and-operations.md)
- [Program reference](program-reference.md)
- [Configuration and reference](configuration-and-reference.md)

## Sources

- Root [`Cargo.toml`](../../Cargo.toml), `[profile.release]`
- [`tests/tests/compute.rs`](../../tests/tests/compute.rs)
- [`scripts/devnet/lib/compute.ts`](../../scripts/devnet/lib/compute.ts)
- [`app/lib/server/compose.ts`](../../app/lib/server/compose.ts) and [`app/lib/server/squads.ts`](../../app/lib/server/squads.ts)
