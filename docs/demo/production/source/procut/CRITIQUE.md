# Pro cut: design critique + polish pass (2026-10-12, 20:01–20:15 BRT)

Ranked by impact on the story and on legibility. [FIXED] = done in tools/build.mjs / tools/overlay.sh, rebuilt, `check` passes.
Before frames: snapshots/before/. After frames: snapshots/after/, after2/, after3/, after4/.

## Story beats
1. [FIXED] **F8 payoff (77–87) read at about 13–19 px.** "1m 05s" was a small chip in a full-width table. Now: wide on Ana's row at 1.12x
   (underlines run filed → paid → settled, "Ana (tenant)" chip in view), push to 1.6x on "1m 05s" on "sixty-five seconds",
   slow drift to 1.68x through "Not 60 days", then ease back to the row at 84.4 so Ana's identity returns before the cut.
2. [FIXED] **Refusal (46.5–55) had no camera emphasis.** Now it punches in to 1.35x on "Refused." (expo.out, 0.5 s) and drifts to 1.42x
   through the 3 s silence. The red frame now holds to 55.0, not 52.0. Everything else stays grey via desat.
3. [FIXED] **First 10 s: F1 was a 7.5 s static hold at 1:1** under the problem lines. It now holds wide under the opener, pushes to the
   R$44,500 balance on "When tenants don't pay" (3.3 s), and drifts to 1.38x through "60 days".
4. [FIXED] **F2 agency was a 7 s still.** Added a slow 1.0→1.14x push toward the KPI row. The honesty label sits outside the cam and stays put.

## Legibility / hierarchy
5. [FIXED] **Explorer flashes broke the ≥1.2 s rule** (x1 status 1.1 s then card 0.9 s; x2 status 0.9 s then log 0.7 s).
   Now there is ONE highlight per flash, the page is pre-scrolled to it, and it is pushed in from frame 1 (1.3→1.4x):
   x1 "Mutav: Register Guarantee" card 2.35 s; x2 the InsufficientFreeCapital/6008 log line in red, 1.95 s; x3/x4 instruction card 1.5 s / 2.1 s.
6. [FIXED] **F8b caps card at 1:1.** It now pushes to 1.42→1.48x on "within limits the program already enforces". R$15,000 and R$20,000 read large.
7. [FIXED] **F5 coverage**: push to 1.3x on "Allocated to coverage R$40,500" with "and anyone can check".
8. [FIXED] **F6a**: push to 1.25x on "needs R$45,000 … holds R$44,500" on the numbers, then back to 1.0 before the "Send anyway" click.
9. [FIXED] **F7b "Filed · NTC-PF-0001"**: push to 1.3x on "Our operator files a claim". The Ana chip moved to a viewport-fixed layer (it was clipping at the edge under zoom).
10. [FIXED] **F7c (line 13), coordinator's note**: the admin chip covered "Max per call R$15,000". The stale "Left in the last 31 days … of R$50,000"
    row sits only 36 source px below Max per call, with the Paid card under both. So no rectangular crop can show Max per call + Paid
    and still hide the stale row. Fallback used: F7c is framed on the Paid card only (1.6→1.65x, content top ≈ source y 405, so the whole bound box is out of frame).
    "Ana · tenant" and "Reserve admin · Squads multisig" are viewport-fixed chips in empty space (top-right, bottom-right) and cover no number.
    Trade-off: the right-hand Before/After number columns are cropped off; only "R$" fragments show at the edge.
11. [FIXED] **The dim read murky** (fill .45). It is now .30, with the same crisp amber frame + glow, and the thing being read is never dimmed.
12. [FIXED] **F3a Ana chip was clipped at the left** ("a · tenant…") by the 1.06x push. Moved x 18 → 96.

## Overlays
13. [FIXED] **Receipts removed** from tools/overlay.sh. At 236 px wide the title reads, but the status/badge is about 10 px, and they pull the eye off the
    viewport. x1–x4 Explorer shots carry the on-chain proof. The timer and tx-rail are kept (the rail's small text is about 11 px, see open items).

## Julia's addition: Draau's stills (colour as edited, framed portrait panels ≤ native size, 1.00→1.04 drift + grain, amber rim)
14. [FIXED] Opener 0.15–1.65: MASP (11.jpg) 512x640 at right, beside the hook. It fades before the mark flies, so the window timing is unchanged.
15. [FIXED] ch1 17.7–20.3: 2.jpg 384x576, top-right, above the lower third. ch2 57.0–59.6: 9.jpg 472x576, same slot.
    ch3 switch card 98.0–99.5: 8.jpg 320x480, left of "SIX MONTHS, SIMULATED".
16. [NOT DONE] Close triptych: the close card's content spans x 160–1640 (pillars) and y 118–870. The only free area is about 290x330 at bottom-right,
    which is too small for three legible portraits, and a band behind the text would muddy the pillars/credit. Needs a close-card layout change (Julia's call).

## Open / for Julia
- Close triptych (item 16): accept skipping it, or shrink the pillars column to make room for a right-side band?
- F7c crop trade-off (item 10): the After column is lost. Alternative: no zoom, with the chip moved above the box. But then the stale R$50,000 row is readable, which violates the guardrail.
- tx-rail at 77–87 (right margin, 230 px wide): small text, about 11 px. Keep it as a texture element, or drop it like the receipts.
- Opener: it is quick and clean (line draw 0.3–1.1, mark fold 1.25, favicon handoff 1.7–2.45). No change except the MASP panel.
