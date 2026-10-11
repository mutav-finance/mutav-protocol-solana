# Vercel WAF rate limit: STAGED, not applied

Status: **staged for Julia's confirmation** (A2, decision 2026-10-10). Nothing in this file is applied by CI or by the app. Apply it by hand once confirmed.

## Why

`/api/squads` and `/api/tx/build` are unauthenticated and each call reads the RPC several times (the multisig scan, the reserve, a blockhash). A loop could exhaust the public devnet RPC during the demo. The read routes are CDN-cached for 3 s (`s-maxage=3, stale-while-revalidate=10`), but these two are POST or per-wallet and cannot be cached.

## The rule

30 requests per minute per IP on `/api/squads` and `/api/tx/build`; above it, deny (HTTP 429) for the rest of the window. `/api/tx/status` is left out: the confirm loop polls it once a second for up to 90 s.

Project `mutav-pilot-app`, team `mutav` (`team_GNLcWCe3CRw43IgLIjconlkU`).

```json
{
  "action": "rules.insert",
  "id": null,
  "value": {
    "name": "pilot api rate limit (30/min/IP)",
    "description": "A2: /api/squads and /api/tx/build, 30 requests per minute per IP",
    "active": true,
    "conditionGroup": [
      { "conditions": [{ "type": "path", "op": "pre", "value": "/api/squads" }] },
      { "conditions": [{ "type": "path", "op": "pre", "value": "/api/tx/build" }] }
    ],
    "action": {
      "mitigate": {
        "action": "rate_limit",
        "rateLimit": { "algo": "fixed_window", "window": 60, "limit": 30, "keys": ["ip"], "action": "deny" },
        "actionDuration": null
      }
    }
  }
}
```

## Apply (after confirmation)

```sh
# Body above saved as waf-rule.json; always target the mutav team.
vercel api "/v1/security/firewall/config?projectId=mutav-pilot-app&teamId=team_GNLcWCe3CRw43IgLIjconlkU" \
  -X PATCH --input waf-rule.json --scope mutav
```

Or in the dashboard: project `mutav-pilot-app` → Firewall → Configure → New rule, with the same conditions and a 30/60 s fixed-window rate limit keyed on IP. Check it with a short loop against a preview URL: request 31 within a minute should return 429.
