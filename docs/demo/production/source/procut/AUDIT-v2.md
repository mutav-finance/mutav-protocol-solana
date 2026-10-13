# Audit: mutav-demo-v2.mp4 transitions and timing

Audited 2026-10-12, 22:15–22:25 BRT. File: `procut/out/mutav-demo-v2.mp4` (2:20.90, 1920×1080, 30 fps). All times below are **v2 time** (procut time + 3.0). Truth sources: `vo-script.final.md`, `captions.en.srt` and the build's intended cut list.

## Method

- **Cut detection.** `scene` / `scdet` scores are almost zero on this dark UI: `select='gt(scene,0.25)'` returned 0 frames, and even 0.12 found none. Instead, each frame was differenced against the previous one (`tblend=difference` + `signalstats` YAVG, 320 px gray). Peaks above 1.5 count as cuts; runs of several frames are fades or camera moves.
- **Frames.** Frames were pulled at cut −0.2 / cut / +0.2 for 40 events (640 px) and viewed as contact sheets, along with extra frames for the close, chapter 3 and the safeguards card.
- **Audio.** `silencedetect` at −70 dB and at −50 dB, plus RMS in 0.25 s windows.

## 1. Cut detection vs the intended list

All 27 intended cuts are present and land within ±0.1 s of procut +3.0, so nothing is missing or offset. Only the 53.0 popup (v2 56.0) scores too low for the difference detector, and frames confirm it is at 56.0.

The detector also found these extra events, all inside shots:

| v2 | What it is | Verdict |
|---|---|---|
| 2.53–2.73 | Logo sting → procut fade | OK |
| 15.6–15.9 | Intro illustration → agency platform crossfade | OK |
| 32.57 | Overview → Coverage tab switch. The Coverage panel renders **empty for about 0.2 s** (skeleton) | ISSUE (minor) |
| 37.9–38.2 | Zoom-in on Coverage while the chip is on screen | ISSUE (minor) |
| 44.4–44.7 / 48.8–49.0 | f6a zoom in, then zoom out with the highlight box still on | ISSUE (minor) |
| 50.53–50.73 | Zoom to the Refused box; the heading swaps mid-move | OK |
| 75.90 + **76.10** | f7e opens on a half-rendered layout (Settled banner + old Settle-payout form), then the page **reflows 0.2 s later** | **ISSUE** |
| 101.1–101.5 | Risks page scroll | OK |
| 104.3–104.8 | Safeguards card cross-dissolves over the risks table (text on text) | ISSUE (minor) |
| 118.2–118.6, 124.3–124.7, 125.8–126.2 | Chapter 3 zoom and pan moves | see row 26 |

## 2–3. Shot table

VO times are measured from the audio where possible (for example, line 10 is actually spoken 51.87–53.43).

| # | v2 time | from → to | shot dur | VO line over it | status | issue | concrete fix |
|---|---|---|---|---|---|---|---|
| 0 | 0.0–3.0 | sting → intro | 3.0 | none | OK | Clean fade. | — |
| 1 | 3.0–20.7 | intro (illustrated) | 17.7 | 1–4 | OK | The 15.8 crossfade is clean. The "This demo" chip sits at y≈690, above the caption band. | — |
| 2 | 20.7 | intro → grid | **0.3** | tail of line 4's caption ("For the hackathon…") | ISSUE | Empty background grid for 0.3 s, with line 4's caption still up over nothing. It reads as a dropped frame or hole. | Delete the grid shot: crossfade intro → card1 directly at 20.7 (0.3 s dissolve), or end line 4's caption at 20.7. |
| 3 | 21.0–23.0 | grid → card1 | 2.0 | none (title) | OK | Card 1 holds exactly 2.0 s; the subtitle question shows. | — |
| 4 | 23.0–27.4 | card1 → f3a (register) | 4.4 | 5 ("Is every guarantee…", "eighteen thousand") | OK | R$18,000 "New cover" is highlighted as it is spoken. The heading "Ana's lease goes on-chain." arrives only at about 27.2. | Optional: bring the heading in at 23.3 so the shot has a title from the start. |
| 5 | 27.4–29.9 | f3a → f3b (confirmed) | 2.5 | 5 ("just an ID, no personal data") | OK | The "Ana… lease ID only" chip doesn't overlap anything. | — |
| 6 | 29.9–32.1 | f3b → x1 Explorer | 2.2 | pause | OK | The highlight on "Mutav: Register Guarantee" lands 0.2 s after the cut, which is fine. | — |
| 7 | 32.1–40.0 | x1 → f5a (reserve) | 7.9 | 6 (BRS / Nora), 7a ("and anyone can check") | ISSUE | (a) At 32.1 the step label still reads LEASE ON-CHAIN; it flips to COVERAGE CHECKED at 32.3. (b) The 32.57 tab switch flashes an empty Coverage panel. (c) The "Every figure is read from…" line is clipped under the browser chrome at the top edge. (d) The chip "Each lease = an on-chain record…" stays up through the 37.9–38.2 zoom and covers the Verify tab / PTAX line. (e) After the zoom, the Capacity-left text is cut at the right viewport edge. (f) Line 6 names BRS / Nora, but nothing on screen points at BRS. | Start f5a on the Coverage tab already loaded (trim the 32.5–32.75 skeleton), or hold Overview until 32.8. Flip the step label at the cut. Fade the chip out by 37.8 and back in after the zoom settles (38.3). Frame the zoom about 8% wider so Capacity-left fits. Optional: highlight the "the reserve holds BRS" line during 32.3–34.5. |
| 8 | 40.0–43.0 | f5a → insert coverage-gate | 3.0 | 7b ("meets the coverage the reserve admin sets") | ISSUE (minor) | The insert's last state, "Next lease needs +R$4,500 · R$45,000 > R$44,500 · refused", appears while line 7 is still speaking. It gives away the refusal beat before "Let's try one more lease." | Stop the insert build at the "Required coverage R$40,500 · set by the reserve admin" state. Drop the "next lease / refused" rows, or delay them to after 43.0 (not shown). |
| 9 | 43.0–49.5 | insert → f6a (one more lease) | 6.5 | 8 ("That needs forty-five thousand…") | ISSUE (minor) | (a) No heading for the first 1.3 s; "Every lease must fit the reserve." shows from about 44.3. (b) During the 44.7–48.8 zoom the form's left side is cut at the viewport edge ("ncy", "obiliária Planalto", the button reads "refuse it"). (c) The yellow highlight stays on during the zoom-out at 48.9. | Fade the heading in at 43.2. Center the zoom on the preview panel with the full "Send anyway" button in frame, or pull the zoom back about 10%. Clear the highlight at 48.7, before the zoom-out. |
| 10 | 49.5–56.0 | f6a → f6b (refused) | 6.5 | 9 "Refused." (50.63), 10 (51.87–53.43), then silence | ISSUE (minor) | (a) The highlight on the Refused box appears during the 50.55 zoom-in. (b) While zoomed, the preview text is cut at the right edge ("needs R$ 45,0…"). (c) The chip "Refused, so every existing guarantee stays covered" (from about 51.2) sits on the Monthly rent / "Bound before you sign" row. (d) The heading drops out at about 55.8, before the popup. Static from 51.0 to 56.0 is the intentional refusal hold. | Trigger the red box at 50.75, after the zoom settles. Move the chip to the empty strip above the form (y≈ the browser tab row) or below the Refused box. Keep the heading until the popup is fully in (56.2). |
| 11 | 56.0–59.0 | popup: failed tx on Explorer | 3.0 | none (silence until 58.5, then music) | ISSUE | The popup lands in the middle of the silence. The script puts the music back **with** the Explorer beat, but the music actually returns at 58.54 (see audio below). The heading disappears again at about 58.8. | Start the music fade-in at 56.2 (popup) instead of 58.5. Keep the heading "The program said no, on-chain." until the 59.0 cut. |
| 12 | 59.0–61.0 | f6b → card2 | 2.0 | 11 ("What happens when Ana pays late?", from 59.5) | OK | One near-blank transition frame at 59.0 (same style as 107.7), which is fine. | — |
| 13 | 61.0–64.5 | card2 → insert-claim (illustrated flow) | 3.5 | no VO for 61.0–64.4 | OK | The diagram carries the shot alone (new information), and line 12 starts at 64.4 on the cut. | — |
| 14 | 64.5–68.4 | insert → f7b (filed) | 3.9 | 12 ("files a claim, our operator verifies it") | OK | The 64.5 zoom-in is clean, and the "Filed · NTC-PF-0001" box shows on cue. | — |
| 15 | 68.4–71.6 | f7b → f7c (paid) | 3.2 | 13 ("reserve pays out, within the multisig's limits") | ISSUE (minor) | (a) Line 13 starts at 67.9 over "Filed"; "Paid" appears 0.5 s later. (b) The chip "Reserve admin · Squads multisig" covers the "Explorer ↗" link that gets highlighted at 71.4. | Cut to f7c 0.4 s earlier (68.0), or slip line 13 to 68.4. Move the chip below the Paid row (y≈ "Moved / Before" header). |
| 16 | 71.6–73.8 | f7c → x3 Explorer pay_claim | 2.2 | pause | ISSUE (minor) | The step label changes to "SETTLED · 1M 05S" at about 73.6 while still on pay_claim, before settle_payout has happened. | Change the step label at the f7e cut (75.9), not before. |
| 17 | 73.8–75.9 | x3 → f7d (settle form) | 2.1 | 14 ("our PIX to the agency…") | OK | The "Ana · tenant" chip pops in at 74.0, clear of other elements. | — |
| 18 | 75.9–77.8 | f7d → f7e (settled) | **1.9** | 14 tail | **ISSUE** | (a) Opens on an intermediate render: the Settled banner is inserted with the Settle-payout form still below it, then the page **reflows at 76.1** (a two-step layout jump in 0.2 s). (b) The chip "PIX to the agency · recorded on-chain" (76.3) covers the tx hash and the "Explorer ↗" link that is highlighted at 77.6. (c) 1.9 s is under the 2.0 s floor. | Trim the f7e head by 0.25 s (start the source at the post-reflow frame) and extend the tail by 0.35 s, making the shot 2.0 s. Move the chip to the right of "No reserve number changed" or below the banner. |
| 19 | 77.8–80.0 | f7e → x4 Explorer settle_payout | 2.2 | pause | OK | — | — |
| 20 | 80.0–87.2 | x4 → claims timeline | 7.2 | 15 ("…sixty-five seconds"), 16 ("Not sixty days.") | ISSUE (minor) | The 1m 05s row highlight is perfect for line 15. Then the frame is **static for 6.7 s** (80.3–87.0, with one tiny change at 83.4). The top of the page is scrolled off: the timeline chart sits at the very top edge and the page title isn't visible. | Shorten the shot by 1.0 s (cut to the tour at 86.2, 2.0 s after "Not sixty days." starts), or add a slow 3% push-in during 83.4–87.2. Scroll the page 60 px up so the Claims header shows. |
| 21 | 87.2–90.2 | claims → tour coverage | 3.0 | 16b starts 87.6 ("And it's all public…") | ISSUE (minor) | The heading "It's all public, live." and the "Live on Solana devnet" chip only appear later in the shot. The page opens mid-table: the "By agency" table is cut at the top edge and there's no page title. | Bring the heading and chip in at 87.4. Start the Coverage capture at the page top (Coverage header + guarantees list) rather than mid-scroll. |
| 22 | 90.2–93.2 | coverage → tour claims | 3.0 | 16b ("every guarantee, claim and account") | OK | The chip carries across the cut without moving. | — |
| 23 | 93.2–96.2 | claims → tour verify | 3.0 | 16b ("live at reserve dot mutav dot finance") | OK | The tour actually runs Coverage → Claims → Verify. The script's note says Overview → Coverage → Claims → Capital → Verify, but the VO's three nouns match the three pages. | Update the script note to match the picture. |
| 24 | 96.2–107.7 | verify → risks + safeguards card | 11.5 | 17 ("Today, our team signs… operator console. Next, a server wallet…", 97.5–107.6) | ISSUE | (a) Line 17 opens with "our operator console" while the screen shows Claim payment caps on /reserve/risks. The console isn't on screen; the heading "Today a console. Next, our backend." is the only cue. (b) "NOT FROZEN" is clipped at the top edge at 96.2. (c) The right column is cut at the right edge after the 101.3 scroll ("…up to this reserve si"). (d) The safeguards card cross-dissolves over table text for about 0.5 s (104.3–104.8), a double exposure. | Open the shot with a 2.5 s operator-console clip (reuse the f7 console frame, 97.5–100.0) under "Today, our team signs…", then cut to risks under "Next…". Otherwise, at least start risks at the "Who signs" / payments-account section. Snap the safeguards card in with a 0.2 s scale-fade instead of a long dissolve. Scroll 40 px further so "NOT FROZEN" isn't clipped. |
| 25 | 107.7–109.7 | risks → card3 (Capital efficiency) | 2.0 | 18 starts 108.1 | OK | Near-black frames at 107.7 and 109.7 are the dip transitions, consistent with 59.0. | — |
| 26 | 109.7–126.3 | card3 → ch3 simulation | 16.6 | 18 ("…growing it to one million", about 112.5), 19, 20 | ISSUE | (a) "One million" is spoken at about 112.5 while the sim shows R$0 → R$120,522; R$1M (R$999k) is only on screen from about 128 on the finale card. (b) The chart is empty for about 2.5 s (109.7–112.2) under the chapter question. (c) During the zooms (118.2–126.0), "What moves the reserve" is cut to "hat moves the reserve", the Operations panel is cut at the right edge, and the top axis labels are cut. | Add a target marker to the sim at shot start: a dashed "Pilot plan cap R$1M" line on the reserve-growth axis, or a chip "Target: R$1M · month 6" from 112.0 to 116.0. Start the data animating at 110.5 (trim 1.5 s of empty chart). Constrain the chapter-3 camera so the heading and Operations panel stay in frame: max zoom about 1.25× instead of the current value, panning only vertically. |
| 27 | 126.3–132.6 | ch3 → finale card | 6.3 | 20 tail (to about 128.6), then no VO | OK | The fade-in over the dimmed chart (126.3–127.8) is a deliberate layered reveal. A 4.0 s static read (128.6–132.6) is acceptable for an honesty card with numbers. | Optional: trim the finale hold by 0.5 s. |
| 28 | 132.6–140.9 | finale → close | 8.3 | 23 (133.0–137.4); line 24 not in the mix | **ISSUE** | The logo sits alone for 6.5 s while line 23 plays. The tagline appears only at 139.1–139.4 and **reserve.mutav.finance at about 140.0, which is 0.9 s before the file ends.** The URL, the call to action, is barely readable. | Bring the tagline in at 137.6 (right after "capital that works"), the URL at 138.2, and extend the close so the URL holds ≥2.5 s (end at about 141.0, or add 1.0 s of tail). Optional: show the tagline with the logo from 135.8. |

### Shots under 2.0 s

| Shot | Duration | Verdict |
|---|---|---|
| Grid, 20.7 | 0.3 s | ISSUE |
| f7e, 75.9 | 1.9 s | ISSUE |
| x1, x3, x4 Explorer flashes | 2.2 s each | Allowed |
| f7d, 73.8 | 2.1 s | OK |

### Static holds over 4 s

| Hold | Verdict |
|---|---|
| Claims timeline, 80.3–87.0 | ISSUE |
| Refusal, 51.0–56.0 | Intentional |
| Finale card, 128.6–132.6 | Borderline, acceptable |
| Close logo, 132.6–139.1 | ISSUE, folded into row 28 |

### Caption band (y ≥ 880)

No non-caption element enters the band. The lowest elements are the Explorer and browser window bottom edge at y≈879 (borderline), the chapter 3 stats row at about 840, and the close disclaimer at about 830.

### Browser window position

The window's position is consistent across all un-zoomed app shots: f3, f5, f6, f7, the tour and risks. No drift was found.

## 4. Audio

- **No digital silence.** `silencedetect n=-70dB d=0.5` finds nothing, and the quietest stretches sit at −66 to −69 dB RMS (room tone). OK.
- **Music out before "Refused." works.** The bed (about −23 dB) drops at **49.39**, and "Refused." starts at **50.63**: 1.2 s of room tone before the word, matching the script's 46.3 → 47.6 procut. OK.
- **The refusal silence runs 5.1 s instead of 3 s.** Line 10 actually ends at **53.43**; its caption is held to 55.0. Room tone then runs 53.43 → 58.54.
- **The music returns at 58.54**, 0.46 s before the chapter-2 card at 59.0. That is near the card, but after the Explorer popup (56.0). The script wants the music back with the Explorer beat and the silence at 3 s.
  - Fix: start the music fade-in at 56.4, which gives 3.0 s of silence after line 10.
  - Alternative: shift the popup to 56.4 and keep the music at the card.
  - Either way, also end line 10's caption at 53.8.
- **No VO overlaps.** The SRT and the measured speech run sequentially; the closest gap is lines 2 → 3 at 0.15 s, as designed.
- **Line 24 isn't in the mix.** No speech after 137.4, so the tagline is on screen only. This matches the "pending Starter credits" note, but see row 28: the on-screen tagline now needs real hold time.

## Top-10 fixes (ranked)

1. **Close card (row 28).** The tagline appears at 139.1 and the URL at about 140.0, in a 140.9 s file, so the URL is readable for under 1 s. Bring the tagline in at 137.6 and the URL at 138.2, and hold ≥2.5 s (add about 1 s of tail).
2. **f7e head (row 18).** It opens on a half-rendered layout that reflows at 76.1, which reads as a glitch. Trim 0.25 s off the head and add 0.35 s at the tail, making the shot 2.0 s. Move the "PIX to the agency" chip off the tx hash / Explorer link.
3. **"One million" not on screen (row 26).** Add a "Pilot plan cap R$1M" target line or chip to the sim, 112.0–116.0. Start the data animating at 110.5, not 112.2.
4. **Refusal silence and music return (audio, row 11).** The silence is 5.1 s, not 3 s, and the popup plays in dead air. Start the music fade-in at about 56.4 (on the popup) and end line 10's caption at 53.8.
5. **Line 17 "operator console" (row 24).** The console isn't on screen while it's named. Open the risks shot with about 2.5 s of the operator console (97.5–100.0), then cut to risks on "Next…". Replace the 0.5 s safeguards dissolve with a 0.2 s snap.
6. **Grid hole at 20.7 (row 2).** 0.3 s of empty grid with line 4's caption still up. Crossfade intro → card1 directly.
7. **Chapter 3 camera clipping (row 26).** The heading and Operations panel are cut at the viewport edges during 118–126. Cap the zoom at about 1.25× and keep the heading in frame.
8. **Coverage-gate insert spoils the refusal (row 8).** Drop or delay the "Next lease needs +R$4,500 · refused" rows so the refusal lands at 50.6 as the reveal.
9. **Claims timeline static for 6.7 s (row 20).** Cut to the tour 1.0 s earlier (86.2) or add a slow push-in. Scroll so the Claims header is visible. Also fade the tour heading and chip in at 87.4 (row 21).
10. **Chips and highlights during camera moves and over targets.** In each case, move the chip off the target or time it after the move settles:

    | Where | Chip or highlight | Fix |
    |---|---|---|
    | f5a, 37.9 zoom | Coverage chip covers Verify / PTAX | Fade out at 37.8, back in at 38.3 |
    | f6a, 48.9 zoom-out | Highlight still on | Clear it at 48.7 |
    | f6b, 50.55 zoom-in | Red box appears mid-move | Trigger at 50.75 |
    | f6b, 51.2 | "Refused, so every…" chip on the form row | Move above or below the form |
    | f7c, 68.4 | Multisig chip covers the Explorer link | Move below the Paid row |
    | f7, from 73.6 | Step label shows SETTLED early | Change it at 75.9 |
    | f5a, 32.57 | Empty Coverage panel flash | Trim the skeleton |

    Also tighten the zoom framings that cut text at the viewport edges (f5a Capacity-left, f6a form left edge, f6b preview right edge).
