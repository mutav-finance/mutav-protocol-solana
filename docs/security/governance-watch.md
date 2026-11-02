# Governance watch

A time lock protects the reserve only if someone notices a proposal before it executes. The governance watcher is that someone for MUTAV's own channel: a stateless, read-only script that GitHub Actions runs every 6 hours. It compares the chain against a file in this repository and mails any difference, or any failure to check, through Resend.

The watcher holds no keys and writes nothing on-chain. The repository is the source of truth: [`governance/expected-state.devnet.json`](../../governance/expected-state.devnet.json) says what the multisigs, the program and the MUTAV config must look like, and every executed proposal updates it in a reviewed PR.

It is one alert channel. A second, independent one (Solana Microscope or Range, run by or alerting a party outside the core team) is still to be chosen; see [Limits](#limits).

## What it checks

| Check | What is compared | Severity |
|---|---|---|
| Multisigs (admin, upgrade) | Owner is Squads v4; the vault PDA derives from the multisig; exact members and permissions, threshold, time lock and `config_authority` (expected `Pubkey::default()`, an autonomous multisig). | CRITICAL |
| Proposals | Every transaction index above `lastKnownTransactionIndex`. Each is reported with the intent path `governance/intents/<cluster>/<first 8 chars of the multisig>/<index>.json` and whether that file is committed. No intent file: "unexpected proposal: run `bun run verify-proposal` before anyone approves". | HIGH |
| Program | Owner is BPF Loader Upgradeable; ProgramData upgrade authority equals the upgrade vault; the executable hash (sha256 of the program bytes, trailing zeros trimmed, as `solana-verify get-program-hash`) equals `program.executableHash`. | CRITICAL |
| MUTAV config PDA | `admin`, `operator`, `pauser`, guardians, no pending admin, operator or pauser handover, `reserve_mint`, `payments_account`, `treasury_account`. | CRITICAL |
| MUTAV config PDA | Every cap, `coverage_ratio_bps`, `fee_take_bps`, the pause flag. | HIGH |
| Durable nonces | Any System nonce account whose authority is a member key of either multisig (the Drift 2026 precursor: a pre-signed approval that can be replayed later). | HIGH |
| Reserve outflows | Sum of decreases of the reserve token account over the last `outflowWindowSecs` (7 h: the 6 h interval plus margin) above `outflowAlertThreshold`; also a scan that hits its page bound before leaving the window. | HIGH |

How the reads work:

- **Proposals.** The Multisig account's `transaction_index` is the last index created. Indexes up to `lastKnownTransactionIndex` were acknowledged by the PR that raised it. For each newer index the watcher checks whether the transaction and proposal PDAs exist. It lists at most 20 new indexes per multisig. Full transaction decoding is `verify-proposal`'s job ([`verify-proposal.md`](verify-proposal.md), PR #114); once it lands, the two share the Squads PDAs and decoders.
- **Nonce accounts.** `getProgramAccounts` on the System program with a `dataSize` filter of 80 and a `memcmp` on the authority at offset 8, once per member key. The layout (solana-sdk `nonce/src/state.rs` and `versions.rs`, bincode) is: `0..4` `Versions` tag (u32), `4..8` `State` tag (u32), `8..40` authority, `40..72` durable nonce, `72..80` lamports per signature. `State::size()` is 80.
- **Outflows.** `getSignaturesForAddress` on the reserve token account, newest first, 100 per page and at most 5 pages; then each successful transaction's pre and post token balances for that account (lookup-table addresses included). Balances count every transfer out, CPIs included. Claim payments, redemptions and fee takes are legitimate outflows: set the threshold above the normal 7-hour volume.

Exit codes and alerts:

| Exit | Meaning | Alert |
|---|---|---|
| 0 | No findings. | None. |
| 1 | One or more findings. | Email, run marked failed. |
| 2 | The watcher could not complete: RPC error, malformed expected state, cluster refused. Findings from the checks that did run are still listed. | Email, run marked failed. |

Silence is not success: an exit 2 alerts like an exit 1. If an earlier step fails (checkout, Bun), the alert step still runs and mails a stand-in report; if Bun itself is unavailable the run is red and GitHub mails the failure of a scheduled run to the person who last changed the cron.

The cluster guard is the one the devnet and release scripts use ([`scripts/devnet/lib/cluster.ts`](../../scripts/devnet/lib/cluster.ts)): an explicit http(s) URL, devnet's genesis hash, mainnet refused by URL and by genesis hash. The report prints the RPC host, never the URL path, which can carry an API token.

## Run it locally

```sh
bun run governance-watch -- --expected governance/expected-state.devnet.json \
  --url https://api.devnet.solana.com --confirm-cluster devnet
```

`--url` falls back to `RPC_URL`. `--report <file>` also writes the report to a file.

## Schedule and its limits

The workflow ([`.github/workflows/governance-watch.yml`](../../.github/workflows/governance-watch.yml)) runs at minute 17 of every sixth hour (`17 */6 * * *`) and on demand (`workflow_dispatch`). Proposals are rare, so the founders chose a sparse schedule (2026-11-01).

<a id="limits"></a>

- **Only time locks longer than about 6 hours are covered.** A proposal approved right after a run can execute before the next one if its time lock is shorter than the interval. GitHub can also delay scheduled runs, sometimes by an hour or more under load. The real pilot's 24 h (admin) and 7 d (upgrade) locks are covered. The devnet test deploy's 60 s and 120 s locks are not: on devnet the watcher reports what already happened.
- The outflow check samples a 7-hour window per run, so a run that is skipped or delayed past the margin leaves a gap.
- It is one channel run by the founders. The second, independent channel recommended in the signing research (SEAL: at least one alert path through a party outside the core team) is still open.
- It does not decode proposals. A proposal with an intent file is still HIGH until it executes and the expected state is updated; the members check it with `verify-proposal`.

## Updating the expected state

`governance/expected-state.<cluster>.json` changes **in the same PR** that records an executed proposal:

1. The intent file for index *N* is merged before the proposal is created ([signing ceremony](signing-ceremony.md)).
2. While the proposal waits, every run reports index *N* as a new proposal (HIGH). That is expected: it is the cue that the time lock is running.
3. After execution, open a PR that sets `lastKnownTransactionIndex` to *N* and changes whatever the proposal changed (a member, the threshold, a role, a cap, the executable hash after an upgrade). Values come from the intent file and are confirmed on-chain by the next run.
4. A cancelled or rejected proposal also raises `lastKnownTransactionIndex`, with nothing else changed.

u64 values are decimal strings (JSON numbers lose precision above 2^53). The file holds addresses and parameters only, never key material.

On devnet the file was filled from [`deployments/devnet.json`](../../deployments/devnet.json) and the devnet harness's deploy record, and checked against devnet on 2026-11-01. `lastKnownTransactionIndex` is 8 (admin) and 4 (upgrade): the 2026-10-12 test-deploy proposals, created before intent files existed.

<a id="alert-settings"></a>

## Alert settings

Repository → Settings → Secrets and variables → Actions:

| Name | Kind | Value |
|---|---|---|
| `RESEND_API_KEY` | Secret | A Resend API key with sending access only, restricted to the sender domain. |
| `ALERT_FROM` | Variable | The sender, for example `MUTAV governance <governance@alerts.mutav.finance>`, on a domain verified in Resend. |
| `ALERT_TO` | Variable | Comma-separated recipients (at most 50): both founders, and the third key holder once there is one. |
| `DEVNET_RPC_URL` | Variable, or secret | Optional. A devnet RPC of your choice; store it as a secret when the URL carries an API key. Without it the public devnet RPC is used, which rate-limits `getProgramAccounts`. |

If any alert setting is missing, the alert step fails the run with a message naming it; the API key is never printed.

### Resend prerequisite

Alerts cannot send yet. As of 2026-11-01:

- `mutav.finance` publishes SPF `v=spf1 -all` (no sender allowed) and DMARC `p=reject`, and no domain is verified in Resend.
- Before alerts can send, verify the sender domain (preferably a subdomain such as `alerts.mutav.finance`) in Resend, then add the DNS records Resend lists (DKIM, and the SPF `include:` on the sending subdomain, before `-all` if it is the apex) in the Vercel DNS zone of team `mutav`.
- Until then, every run with a finding or error fails loudly: the run is red and GitHub mails the failure, but no Resend email arrives.

## Sources

- [`scripts/governance/watch.ts`](../../scripts/governance/watch.ts), [`scripts/governance/notify.ts`](../../scripts/governance/notify.ts), [`scripts/governance/lib/`](../../scripts/governance/lib/); tests in [`scripts/test/governance-watch.test.ts`](../../scripts/test/governance-watch.test.ts) and [`governance-notify.test.ts`](../../scripts/test/governance-notify.test.ts)
- Squads v4 Multisig layout: [`scripts/devnet/lib/squads.ts`](../../scripts/devnet/lib/squads.ts)
- Nonce account layout: [solana-sdk `nonce/src/state.rs`](https://github.com/anza-xyz/solana-sdk/blob/master/nonce/src/state.rs), [`versions.rs`](https://github.com/anza-xyz/solana-sdk/blob/master/nonce/src/versions.rs)
- Resend send-email API: [resend.com/docs/api-reference/emails/send-email](https://resend.com/docs/api-reference/emails/send-email)
- "Safe multisig signing on Solana" research report (2026-10-31), sections on watchers and the signing ceremony
- [Signing ceremony](signing-ceremony.md), [Governance and keys](governance-and-keys.md)
