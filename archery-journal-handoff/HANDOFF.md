# Archery Performance Journal — Handoff for Claude Code

Build a phone-first web app for an Olympic recurve archer. It logs training arrow by arrow and grades each shot on process: the **mental program (M)** and the **shooting cycle (S)**. The approach follows *With Winning in Mind* (Lanny Bassham): measure process quality, not only score.

Reference prototype: `reference/prototype.dc.html`. It is a design-canvas component (Design Component format), not production code. Use it as the source of truth for **layout, flow, labels, colours and scoring math**. Do not port its runtime (`DCLogic`, `<sc-if>`, `<sc-for>`, `{{holes}}`); rebuild it in the stack below.

---

## 1. Non-functional requirements

- Runs in a web browser, with **phone first** (390 × 844 reference). Must also work on a tablet and desktop.
- **Logging must be fast.** One arrow = 1 tap for the score plus 2 taps for the grades. Every touch target must be at least 44 px. The app must be usable with one hand at the shooting line.
- **Offline-first.** Ranges often have no signal. All data stays on the device, with no backend in v1.
- Data must survive reloads, closed tabs and phone restarts. Use IndexedDB, not localStorage.
- **Installable** as a PWA (manifest plus a service worker that caches the app shell).
- Readable outdoors in sunlight: high contrast, WCAG AA text contrast.
- UI language: English for v1. Keep strings in one place so Slovak can be added later.

### Suggested stack (change it if you have a preference)
- Vite + React + TypeScript
- Dexie.js (IndexedDB) for persistence
- vite-plugin-pwa
- Plain CSS or CSS modules using the design tokens in §8, with no UI kit
- Vitest for the unit tests on the scoring and statistics logic

---

## 2. App structure

A bottom tab bar with 4 tabs, plus one global overlay:

| Tab | Purpose |
|---|---|
| **Log** | New session setup → arrow-by-arrow logging |
| **History** | Training log list → session detail (stats + per-end table) |
| **Gear** | Equipment setup + saved setup snapshots |
| **Sights** | Sight marks per distance + competition log |
| *Grades* (header button) | Bottom sheet showing the M/S grading rubric |

---

## 3. Core flow — Log tab

### 3.1 New session screen (shown when no session is active)
- Header: "New session" and today's date.
- **Distance** chips: 18, 25, 30, 50, 60, 70, 90 m.
- **Target face** chips: `40 cm 10–6` (recurve triple/spot face), 40, 60, 80, 122 cm.
- **Arrows per end** chips: 3 ("indoor style") or 6 ("outdoor style").
- **Smart defaults:** picking a distance pre-selects a face and the arrows per end. The user can override both.

  | Distance | Face | Arrows/end |
  |---|---|---|
  | 18 | 40 cm 10–6 | 3 |
  | 25 | 60 | 3 |
  | 30 | 80 | 6 |
  | 50 / 60 / 70 / 90 | 122 | 6 |

- Primary button: `Start session · {dist} m · {face}`.

### 3.2 Active session screen
Top to bottom:
1. **Setup pills** (read-only): `70 m` · `122 cm face` · `6 arrows/end`.
2. **End card**
   - "End N", the end score and the running session total.
   - **Arrow slots** (one per arrow), each showing a score chip coloured by zone and `M2 S1` underneath. The active slot is ringed in the accent colour.
   - Segmented toggle **Keypad / Target face** plus an **Undo** button (clears the last scored arrow).
   - Input area:
     - **Target face mode:** an SVG target, tapped where the arrow landed. The arrow is scored from the tap distance (§5) and plotted. Arrows in the current end are magenta dots numbered 1..n. Arrows from earlier ends in the session are small dark dots, so the group stays visible. Below the target are quick `Miss (M)` and `X` buttons.
     - **Keypad mode:** a 4-column grid with `X 10 9 8 7 6 5 4 3 2 1 M`. On the `40 cm 10–6` face it shows only `X 10 9 8 7 6 M`. Each key is coloured by its target zone.
3. Hint text: "Score an arrow, then grade M and S. Tap a scored arrow above to re-grade it."
4. **End details card**
   - Two steppers (−/+): **Let-downs** and **Correct let-downs**.
     - Correct let-downs can never be more than let-downs.
     - Raising correct let-downs above let-downs also raises let-downs.
     - Lowering let-downs below correct let-downs also lowers correct let-downs.
   - **Note** textarea for the end.
   - **Save end N** (enabled only when every arrow has a score) and **Finish session** (enabled only when at least one end is saved).
5. **Saved ends list** (newest first): `E3 | 10 9 X 8 9 7 | M 1.8 · S 1.5 · LD 1/1 | 52  Σ 214`.

### 3.3 Arrow-by-arrow grading flow (the key interaction)
After every score input (target tap, keypad, Miss or X):
1. A **bottom sheet slides up** over the screen. Its header shows the arrow's score chip, `Arrow 3 of 6 · Step 1 of 2`, a two-segment progress bar and a **Skip** button.
2. **Step 1 — Mental program (M):** 5 full-width rows. Each row has a coloured grade badge and the rubric text (§4). Tapping a row stores M and goes straight to step 2.
3. **Step 2 — Shooting cycle (S):** the same layout with the S rubric. Tapping a row stores S, closes the sheet and moves to the next empty arrow slot.
4. Sheet footer: **← Back to M** (step 2 only) and **Change score**. Change score closes the sheet and pins the current slot, so the next score input overwrites it. The existing grades are kept and pre-highlighted when the sheet reopens.
5. **Skip** closes the sheet without grades and moves to the next empty slot. Ungraded arrows are allowed.
6. **Tapping a slot that already has a score** reopens the sheet for that arrow so it can be re-graded. **Tapping an empty slot** selects it as the next one to fill.
7. Setting: **"Ask for grades after each arrow"** (default on). When it is off, scoring just moves to the next slot, and arrows can be graded later by tapping their slots.

Slot advance rule: after an arrow is completed, the cursor moves to the first empty slot in the end. If all slots are full, it stays where it is.

**Finish session:** saves the session (date, distance, face, arrows per end, ends) to History, clears the active session, and opens the new session's detail view in History.

> **Persistence requirement (not in the prototype):** the active session — current end, saved ends and the cursor — must be written to IndexedDB on every change. Reopening the app mid-session must resume exactly where the archer left off.

---

## 4. Grading rubric (1 = best)

| Grade | Mental program (M) | Shooting cycle (S) |
|---|---|---|
| 1 | Full program arrow, clear picture | Automatic, continuous expansion, clicker on time |
| 2 | One small intrusion, let down correctly | Minor hesitation or form issue |
| 3 | Shot with doubt or form thoughts | Slow or hesitant |
| 4 | Program mostly missing; thinking about score or form | Slow expansion |
| 5 | No program, fighting the shot | Cycle falls apart |

Grade badge colours (dark→light→dark scale, so grades differ in lightness and not only in hue):
`1 #0B6E4F/white · 2 #7CC29A/ink · 3 #F2D65C/ink · 4 #F2994A/ink · 5 #B3261E/white`.

---

## 5. Scoring logic (unit-test this)

Arrow value: `'X' | 10..1 | 'M'`. Numeric value: X = 10, M = 0. The X count is tracked separately.

Target tap → normalised position: `x, y ∈ [-1, 1]` relative to the face centre (use `getBoundingClientRect`, which handles zoom and scaling), `d = √(x² + y²)`.

**Full face (40/60/80/122 cm), 10 rings:**
- `d ≤ 0.05` → X
- `d < 1` → `10 − floor(d × 10)`
- otherwise → M

**40 cm 10–6 face (rings 6–10 only, scaled to fill the drawing):**
- `d ≤ 0.10` → X
- `d < 1` → `10 − floor(d × 5)`
- otherwise → M

**Store `x, y` for target-mode arrows** (null for keypad arrows) so groups can be plotted later. Store them normalised to the face so the face size doesn't matter.

Line-cutter note: v1 uses a simple boundary (a tap exactly on a ring line scores the lower ring, per `floor`). Optional improvement: treat a tap within ±arrow radius of a line as the higher score, as WA rules do.

Zone colours (WA): X/10/9 gold `#FFE11A` · 8/7 red `#D22B2B` · 6/5 blue `#00A2E8` · 4/3 black `#1A1A1A` · 2/1 white `#FFFFFF` · M grey `#D7D9DB`.

---

## 6. History tab

**List:** session cards, newest first. Each card shows the date, `70 m · 122 cm · 4 ends`, total / max, avg M, avg S and Program %.

**Detail:**
- Back button, date, `distance · face · N arrows`.
- 6 stat tiles: **Total**, **Avg arrow** (2 decimals), **10s (X)**, **Avg M**, **Avg S**, **M1–2 %**.
- **Avg arrow by mental grade:** for M = 1..5, a bar with the average arrow score of arrows given that M grade and the arrow count. This is the key coaching chart: it shows whether process quality drives score. Next to it: `LD correct/total`.
- **Ends table** (scrolls horizontally on a phone). Columns as specified by the user:
  `Date | End | Arrows | EndScore | Grade M | Grade S | Let-downs | Correct let-downs | Note`
  Grade M/S per end = the average over graded arrows (1 decimal), or "–" if no arrows are graded.

Statistics definitions (pure functions; unit-test them):
- `total = Σ value`, `max = arrows × 10`, `avgArrow = total / arrows`
- `avgM` / `avgS` = mean over arrows that have that grade (ignore ungraded arrows)
- `programPct = round(count(M ≤ 2) / count(M graded) × 100)`
- `tens = count(X or 10)`, `xs = count(X)`
- `ld = Σ end.ld`, `cld = Σ end.cld`
- `byM[g] = { n, avgArrow }` for g = 1..5

Nice to have later: an edit/delete session option, filtering by distance, trends over time (avg M versus avg arrow per session), and CSV/JSON export.

---

## 7. Gear tab

The current setup is a form of labelled text inputs, grouped as below. Each field label is followed by its input hint (shown as placeholder text):

- **Bow:** Riser (model), Limbs model (model), Limbs poundage (lbs), Draw weight on fingers (lbs)
- **Arrows:** Arrow model, Spine, Length (in), Points (grain), Nocks
- **String:** Material, Strands (count), Brace height (in), Nocking point (mm)
- **Tuning:** Tiller top (mm), Tiller bottom (mm), Plunger tension, Plunger position, Arrow rest, Clicker position
- **Stabilisers & accessories:** Long rod (length), Side rods (length), V-bar (angle), Weights (oz), Tab, Sight

Header counter: `filled / total fields`.

**Setup snapshots:** a name input plus **Save**. This stores a copy of all gear fields with the date. The list shows each snapshot (name, date, filled count) with a **Load** button that restores it into the current setup.
Recommended addition: when a session starts, store the current gear snapshot id on the session, so scores can later be compared across setups.

---

## 8. Sights tab

**Sight marks table:** one editable row per distance (default rows 18/30/50/60/70/90 m) with columns `Dist. | Elevation | Windage | Note`. **+ Add distance** adds a row.
Recommended: on the active session screen, show the sight mark for the session's distance as a small pill.

**Competition log:**
- Form fields: Date, Event, Round, Score, Sight mark used, Conditions, Notes. **Add competition** prepends the entry.
- Entry card: event name, a large score, `date · round`, and `Sight X · conditions · notes`.

---

## 9. Design tokens

| Token | Value |
|---|---|
| ground | `#F4F5F2` |
| surface | `#FFFFFF` |
| ink | `#14181C` |
| muted text | `#5B6168` |
| border | `#C9CDC6` / divider `#DDE0DA` / subtle fill `#EDEFEA` |
| accent (setting) | `#0B6E4F` (other options: `#14181C`, `#1D4ED8`, `#B45309`) |
| current-end dot | `#E5007E` with a 2 px white border |
| focus ring | `3px solid #2C6BED`, offset 2 px |

- Type: **Space Grotesk** (headings and numbers) and **Inter** (body), from Google Fonts. Use tabular numerals for scores.
- Radii: cards 16 px, buttons 12–14 px, sheets 22 px top.
- Header: dark (`ink`), 60 px, with a small target logo, the title "Performance Journal", a context subtitle and a "Grades" button.
- Tab bar: 66 px, white, icons with labels; the active tab uses the accent colour.
- Icons: inline stroke SVG (or lucide-react). No emoji.

---

## 10. Data model (TypeScript sketch)

```ts
type ArrowValue = 'X' | 10 | 9 | 8 | 7 | 6 | 5 | 4 | 3 | 2 | 1 | 'M';
type Grade = 1 | 2 | 3 | 4 | 5;
type FaceId = '40s' | '40' | '60' | '80' | '122';   // '40s' = 40 cm 10–6

interface Arrow { v: ArrowValue | null; m?: Grade | null; s?: Grade | null; x?: number | null; y?: number | null; }
interface End   { arrows: Arrow[]; ld: number; cld: number; note: string; }
interface Session {
  id: string; date: string /* ISO */; distance: number; face: FaceId; arrowsPerEnd: 3 | 6;
  ends: End[]; gearSnapshotId?: string; status: 'active' | 'finished';
}
interface GearSnapshot { id: string; name: string; date: string; fields: Record<string, string>; }
interface SightMark   { id: string; distance: string; elevation: string; windage: string; note: string; }
interface Competition { id: string; date: string; event: string; round: string; score: string; sightMark: string; conditions: string; note: string; }
interface Settings    { accent: string; defaultInput: 'target' | 'keypad'; askGrades: boolean; }
```

Dexie tables: `sessions`, `gearCurrent` (a single row), `gearSnapshots`, `sightMarks`, `competitions`, `settings`.

---

## 11. Acceptance criteria

1. On a phone, one arrow is fully logged with 3 taps: target or keypad, then M, then S. A 6-arrow end takes at most 19 taps, including Save.
2. Target taps score correctly on both the full and the 10–6 face (covered by unit tests at the ring boundaries and the X).
3. Killing the browser mid-end and reopening restores the exact state.
4. History statistics match the formulas in §6 (unit tests).
5. The app works fully in airplane mode after the first load, and can be installed to the home screen.
6. All interactive elements are real `<button>`/`<input>` elements, are keyboard reachable, have visible focus, and have `aria-label` on icon-only buttons. In target mode, the face button tells keyboard users to use the keypad.
7. No horizontal page scroll at 360 px width. Only the ends table scrolls sideways, inside its own container.

## 12. Open questions for Vlado
- Should the app support **multiple archers or bows**, or just one?
- Is **sync or backup** needed (export file, cloud) beyond on-device storage?
- Should **competition entries** also allow arrow-by-arrow logging (reusing the Log flow with `type: 'competition'`)?
- Should there be **per-arrow let-downs** instead of per-end counts?
- Should the **Slovak** translation be in v1?

## Suggested first prompt for Claude Code
> Read HANDOFF.md and reference/prototype.dc.html. Scaffold the app with the suggested stack, implement the data model and the scoring and statistics modules with unit tests first, then build the Log tab (new session → arrow-by-arrow grading sheet) with IndexedDB persistence, then History, Gear and Sights. Match the prototype's layout and tokens.
