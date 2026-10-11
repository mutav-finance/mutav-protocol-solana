# Vercel WAF rate limit: STAGED, not applied

Status: **staged for Julia's confirmation** (A2, decision 2026-10-10). Nothing in this file is applied by CI or by the app. Apply it by hand once confirmed.

## Why

Every `/api/*` route is unauthenticated and reads the RPC. The read routes are CDN-cached for 3 s and cached in process for 3 s (1 s for a `?fresh=` read), but a loop can still vary the URL to miss the CDN, and `/api/squads` (POST) and `/api/tx/build` cannot be cached at all. A loop could exhaust the public devnet RPC during the demo.

## The rules

Two rules, per IP, deny (HTTP 429) for the rest of the window above the limit:

1. **`/api/*`: 120 requests per minute.** Leaves room for normal use: the confirm loop polls `/api/tx/status` once a second (up to 90 s) and pages poll the read routes every 10 s.
2. **`/api/squads` and `/api/tx/build`: 30 requests per minute.** These compose transactions and scan the multisig.

Project `mutav-pilot-app`, team `mutav` (`team_GNLcWCe3CRw43IgLIjconlkU`).

```json
[
  {
    "action": "rules.insert",
    "id": null,
    "value": {
      "name": "pilot api rate limit (120/min/IP)",
      "description": "A2: every /api route, 120 requests per minute per IP",
      "active": true,
      "conditionGroup": [{ "conditions": [{ "type": "path", "op": "pre", "value": "/api/" }] }],
      "action": {
        "mitigate": {
          "action": "rate_limit",
          "rateLimit": { "algo": "fixed_window", "window": 60, "limit": 120, "keys": ["ip"], "action": "deny" },
          "actionDuration": null
        }
      }
    }
  },
  {
    "action": "rules.insert",
    "id": null,
    "value": {
      "name": "pilot compose rate limit (30/min/IP)",
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
]
```

## Apply (after confirmation)

```sh
# Save each object of the array above as its own file and send them one at a
# time (the endpoint takes one change per call); always target the mutav team.
vercel api "/v1/security/firewall/config?projectId=mutav-pilot-app&teamId=team_GNLcWCe3CRw43IgLIjconlkU" \
  -X PATCH --input waf-rule-api.json --scope mutav
vercel api "/v1/security/firewall/config?projectId=mutav-pilot-app&teamId=team_GNLcWCe3CRw43IgLIjconlkU" \
  -X PATCH --input waf-rule-compose.json --scope mutav
```

Or in the dashboard: project `mutav-pilot-app` → Firewall → Configure → New rule, with the same conditions and fixed-window rate limits keyed on IP. Check them with a short loop against a preview URL: request 31 to `/api/tx/build` within a minute, or request 121 to `/api/ledger`, should return 429.
