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

Fork tests (Surfpool, against Nora's devnet BRS mint) run separately and on demand; see `tests-fork/`.

### Client

The client in `clients/js` is generated from the program IDL with Codama (see `clients/js/package.json` for the generate and build scripts). Regenerate it after any change to the program interface, and commit the result.

No command in this repo runs in watch mode.

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
