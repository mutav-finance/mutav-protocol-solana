# MUTAV live diagram (sub-composition)

A 460x260 annotation card that lights one step at a time during on-chain shots. Past steps dim to text-3 (#555b66); one label is visible at a time.

- `compositions/diagram.html` is the sub-composition (`data-composition-id="live-diagram"`; styles and script live inside `<template>`).
- `index.html` is a 20 s preview: register (0–5 s), refusal (5–10 s), claim (10–20 s) over a placeholder app window.

## Host wiring

Copy `compositions/diagram.html` into the host project's `compositions/` folder. The host page must load GSAP and declare the Inter and JetBrains Mono `@font-face` rules. It sits in the annotation slot, top-right inside the app viewport (x 160–1760, y 212–880), 24 px in from the right and top edges: left 1276, top 236.

```html
<div id="ld-claim" data-composition-id="live-diagram" data-composition-src="compositions/diagram.html"
  data-variable-values='{"mode":"claim","steps":"0.5,2.0,3.5,5.0,6.5","amount":"R$1,500"}'
  data-start="68.0" data-duration="10" data-track-index="5" data-width="460" data-height="260"
  style="position:absolute;left:1276px;top:236px;width:460px;height:260px"></div>
```

Several instances with different `data-variable-values` can share the same file; the preview uses three.

## Variables

| id | values | meaning |
|---|---|---|
| `mode` | `register` / `refusal` / `claim` | which diagram plays |
| `steps` | `"t1,t2,…"` seconds, relative to the clip's `data-start` | when each step's arrow starts drawing (0.4 s draw, then the label fades in). Missing values fall back to defaults. |
| `amount` | string, default `R$1,500` | payout label in the claim mode |

Steps per mode (the card fades in during the first 0.25 s; content keeps 24 px padding inside the card):

- **register**, 1 step (default 0.4): Agency → Reserve arrow, green check on Reserve, "Guarantee registered · on-chain".
- **refusal**, 1 step (default 0.4): "Reserve R$44,500" sits above the bar on the left, and "Required R$40,500" sits above a white tick on the bar. The next-lease segment grows on the bar from the Required tick to R$45,000, the part past the reserve edge turns red, and the result line appears: "Next lease → R$45,000 > R$44,500 · refused". The numbers are fixed in the file. The bar axis runs from R$36,000 to R$46,000, so the R$500 overshoot is visible at card size.
- **claim**, 5 steps (defaults 0.4, 1.4, 2.4, 3.4, 4.4):
  1. Agency → Reserve, "Claim filed".
  2. Operator → Reserve with a check on Operator, "Operator verifies ✓".
  3. Reserve → Agency, amber, "R$1,500 · PIX to the agency".
  4. Check on Reserve, "PIX recorded on-chain ✓".
  5. Agency → Landlord, grey, "Agency pays the landlord · off-chain".

Keep consecutive step times at least about 0.7 s apart so each label has time to read.
