# Deployments

One JSON file per cluster records what is deployed there. Every value can be checked on-chain.

| File | Cluster | Status |
|---|---|---|
| [`devnet.json`](devnet.json) | devnet | Test deploy of `v1.0.0-devnet` under a throwaway program ID |

What each file records:
- **`program`:** the deployed program ID, the ID declared in `lib.rs`, the commit and tag, the executable hash, how the hash is computed, the kind of build, and the deploy time.
- **`accounts`:** the config account, the reserve mint and its token program, and the treasury and payments accounts.
- **`governance`:** the admin and upgrade multisigs (Squads v4) with their vaults, thresholds and time locks, plus the operator and pauser keys.
- **`parameters`:** the reserve settings at deploy time. Amounts are in the reserve mint's base units (6 decimals: `1000000` = R$1).

To check a deploy against its record, run the read-only verifier with the deploy's config and expected hash:

```
bun scripts/devnet/verify.ts --config <deploy.json> --url <rpc> --confirm-cluster devnet --expected-hash <executableHash>
```

These files hold public addresses only, never keys. Each new deploy, upgrade or role change updates its file in the same PR that records it.
