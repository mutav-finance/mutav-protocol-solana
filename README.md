# MUTAV Protocol (Solana)

MUTAV is an institutional *fiador*: it gives Brazilian tenants a rental guarantee (*fiança onerosa*, Lei 8.245/91 art. 37 II) so they need neither a personal guarantor nor a deposit. Real-estate agencies distribute it through the MUTAV platform. Every guarantee is backed by an **on-chain, verifiable BRL guarantee reserve**, operated by MUTAV. This repository holds the Solana program that custodies that reserve: it records the cover of every active guarantee, admits guarantee fees, pays approved claims to MUTAV's payments account, and refuses any capital movement that would leave the guarantees under-covered. The reserve is **operational infrastructure that keeps the guarantees healthy, not a yield product**. Anyone can recompute its coverage from public state.

## Pilot

The goal of the pilot is to prove that a digital-asset reserve can be run as a viable operation: MUTAV operates it, and anyone can verify it. It runs with real money and real guarantees under a **low ceiling** of hard on-chain caps (proposed: R$100k maximum reserve, R$30k maximum cover per guarantee, R$60k per agency, R$10k / R$20k claim payments per call / per 30 days). Admins raise the caps only as the pilot proves itself. See [`docs/spec.md`](docs/spec.md#8-caps) for the full list.

The reserve holds BRS (Nora Finance, 1:1 BRL stablecoin) and, through an adapter, Etherfuse TESOURO (tokenized Brazilian treasury).

## Scope of this repo

This repo ships the on-chain program and a TypeScript client that composes transactions. It holds no keys and no UI. The user-facing surfaces (admin console, investor area, agency transparency page) and the operator automation live in [`mutav-finance/mutav-app`](https://github.com/mutav-finance/mutav-app), which consumes the client published from here as `@mutav-finance/mutav-protocol-solana`.

## Layout

```
mutav-protocol-solana/
├── programs/
│   ├── mutav/                    # core program: custody, shares, NAV, exposure registry,
│   │                             # solvency gate, async queue, roles, claim payments
│   ├── mutav-adapter-interface/  # crate: shared adapter discriminators and layouts
│   └── mutav-adapter-mock/       # devnet and tests only
├── tests/                        # LiteSVM integration tests
├── tests-fork/                   # Surfpool mainnet/devnet-fork tests
├── clients/js/                   # Codama-generated client (@mutav-finance/mutav-protocol-solana)
├── scripts/                      # devnet bootstrap: initialize, roles, caps, allowlist
└── docs/
    ├── spec.md                   # protocol specification (source of business rules)
    ├── plan.md                   # implementation plan
    ├── provenance.md             # hackathon development provenance
    └── decisions/                # architecture decision records
```

## Quickstart

### Toolchain

| Tool | Version |
|---|---|
| Anchor CLI (via `avm`) | 1.2.0 |
| Solana CLI (Agave) | 4.1.2 |
| Rust | ≥ 1.89 (pinned to 1.94.1 in `rust-toolchain.toml`) |
| Surfpool | 1.6.0 |
| Bun | current stable |

```sh
avm install 1.2.0 && avm use 1.2.0
agave-install init 4.1.2
```

### Build

```sh
anchor build
```

### Test

Tests run on LiteSVM. Cap threads and build jobs: several test runners at once will saturate the machine.

```sh
anchor build   # tests load the compiled programs from target/deploy
RUST_TEST_THREADS=4 CARGO_BUILD_JOBS=4 cargo test -p mutav-tests
```

Fork tests (Surfpool, against Nora's devnet BRS mint) run separately and on demand: `bun tests-fork/happy-path.ts --program-keypair <path>`; see [`tests-fork/README.md`](tests-fork/README.md).

### Client

The client in `clients/js` is generated from the program IDL with Codama (see `clients/js/package.json` for the generate and build scripts). Regenerate it after any change to the program interface, and commit the result. Hand-written PDA, read and preview helpers sit next to the generated code; see [`clients/js/README.md`](clients/js/README.md). `bun run test:client` checks them against vectors exported from the program.

No command in this repo runs in watch mode.

## Deploying

The scripts in `scripts/devnet/` compose instructions; they never open a key file and never sign. The upgrade authority and `VaultConfig.admin` belong to a Squads v4 vault. Every admin step is therefore written as an **unsigned Squads proposal** (`*.json`), and members create, approve and execute it from mutav-app `apps/admin` or the Squads app. Only `deploy.ts` touches keys: it passes keypair **paths**, kept outside the repo, to the Solana CLI. Each script refuses a non-local URL unless you pass `--confirm-cluster devnet`. They are not built for mainnet: mainnet goes through `.github/workflows/release.yml` and the spec §14.5 runbook.

```sh
# 0. Rehearse everything against a throwaway local validator.
anchor build
bun scripts/devnet/dry-run.ts --program-keypair ~/.config/solana/mutav/mutav-keypair.json

# 1. Fill a copy of scripts/devnet/devnet.example.json outside the repo (every <FILL: …>).
CFG=~/mutav/devnet.json; RPC=https://api.devnet.solana.com

# 2. Deploy, then hand the upgrade authority to the Squads vault.
bun scripts/devnet/deploy.ts --url $RPC --confirm-cluster devnet \
  --payer ~/.config/solana/mutav/deployer.json \
  --program-keypair ~/.config/solana/mutav/mutav-keypair.json \
  --upgrade-authority <SQUADS_VAULT>

# 3. Proposals (fund the vault with ~0.1 SOL first: it pays rent for initialize).
bun scripts/devnet/init.ts      --config $CFG --url $RPC --confirm-cluster devnet --out init.json
bun scripts/devnet/allowlist.ts --config $CFG --proofs allowlist-proofs.json --out allowlist.json
#    … execute both, then if needed:
bun scripts/devnet/roles.ts     --config $CFG --out roles.json
bun scripts/devnet/caps.ts      --config $CFG --url $RPC --confirm-cluster devnet --out caps.json

# 4. Post-deploy checks.
bun scripts/devnet/verify.ts --config $CFG --url $RPC --confirm-cluster devnet
```

`verify.ts` checks:

- the upgrade authority is the configured vault;
- `feature_flags == 0` and `buffer_earmark == 0`;
- admin, operator, pauser and the allowlist root are as configured;
- the Squads multisig has `config_authority == Pubkey::default()`, `time_lock ≥` the agreed floor, and a sane threshold.

After the deploy, dump the live `VaultConfig` and `VaultState` into `tests/fixtures/layout/v1/` (spec §14.7).

The devnet example sets `price.maxNavMoveBps = 10000`. The NAV-move guard measures the move gross, so on a small demo reserve a guarantee-fee batch or a claim payment would otherwise trip it and halt fulfilment. The inflow-adjusted guard is ADR 0013, which is pending. Until it lands, the admin can clear a tripped guard with `clear_fulfil_halt` (ADR 0015). Lower the bound for the real pilot.

### Devnet addresses

To fill at deploy.

| What | Address |
|---|---|
| Program `mutav` | `8scC79jkU7SPM9v6M4nB833R8EeqKknfwdRdjn73Qqv9` (declared; not yet deployed) |
| Upgrade authority (Squads vault) | _TBD_ |
| Squads multisig | _TBD_ |
| `VaultConfig` (`["config", BRS mint]`) | _TBD_ |
| `VaultState` | _TBD_ |
| Share mint | _TBD_ |
| Reserve (BRS token account) | _TBD_ |
| BRS mint (Nora, devnet) | `BRS2CELW6Cueo2mrMUVvAr5GDT7Pw8TeostC2JLMpBk4` |
| Operator | _TBD_ |
| Pauser | _TBD_ |
| Treasury / payments token accounts | _TBD_ |

## Documentation

- [Protocol specification](docs/spec.md): accounts, instructions, invariants, caps, events.
- [Implementation plan](docs/plan.md): task-by-task plan for the hackathon build.
- [Architecture decisions](docs/decisions/): ADRs for the locked design choices.
- [Development provenance](docs/provenance.md): prior MUTAV work and what was built in the hackathon window.
- [Security policy](SECURITY.md).

## Security

There are **no keys in this repository**: no keypairs, no secret keys, no private-key environment variables. The client composes transactions and never signs. The operator key is held in KMS by mutav-app, and admin authority is a Squads multisig. Program and deploy keypairs live outside the repo, and `*.json` keypair files are gitignored.

The program is **unaudited and pre-pilot**. Do not deposit funds you are not prepared to lose. To report a vulnerability, see [SECURITY.md](SECURITY.md).

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE). Third-party code adapted under the MIT license is attributed in `NOTICE` and in the affected file headers.
