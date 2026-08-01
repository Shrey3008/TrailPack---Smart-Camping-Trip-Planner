# Frontend cleanup plan (#4 design tokens, #5 cleanup batch)

Working notes so this survives a session cutoff. Everything below was verified
against the source on 2026-08-01, not recalled — re-check before acting if the
tree has moved on.

Context: this follows a design audit of TrailPack. Items #1–#3 are done and
deployed (CI, backend test coverage, a privilege-escalation fix in
`POST /admin/setup`, merging the checklist into one taxonomy, and leading the
dashboard with the user's own trips). What remains is frontend polish.

---

## #4 — Design token consolidation

### The problem, measured

`--radius` means five different things depending on which page you are on, and
`--radius-sm` means two:

| File | `--radius` | `--radius-sm` | other |
|---|---|---|---|
| `index.html` | **12px** | — | `--radius-lg: 16px`, `--radius-xl: 22px` |
| `login.html` | **10px** | 8px | |
| `register.html` | **10px** | 8px | |
| `checklist.html` | **16px** | 10px | |
| `profile.html` | **16px** | 10px | |
| `admin.html` | **12px** | 8px | |
| `checklist-preview.html` | **14px** | — | |
| `styles.css` | — | 8px | `--radius-md: 12px`, `--radius-lg: 16px`, `--radius-full: 9999px` |
| `dashboard-light.css` | **12px** | — | `--radius-lg: 16px` |

`organizer.html`, `forgot-password.html`, `accept-invite.html` declare none and
inherit from whichever stylesheet they load.

Separately, `checklist.html` hardcodes radii that bypass tokens entirely.
Measured live earlier via `getComputedStyle`: `.ins-card.wx-hero` **24px**,
`.ins-card-white` / `.trip-summary-card` / `.info-card` **14px**,
`.tp-modal-card` / `.ed-modal-card` **16px** — three different radii on one
screen. Re-measure before changing; these were read off the deployed page.

### Target scale

Adopt what `styles.css` and `dashboard-light.css` already use, so the app pages
change least:

```
--radius-sm:   8px
--radius:     12px
--radius-lg:  16px
--radius-full: 9999px
```

Drop `--radius-md` (duplicate of `--radius`) and `--radius-xl` (single use in
`index.html`; fold into `--radius-lg` or keep as a one-off literal).

### Approach

1. Define the scale once. There is no shared stylesheet loaded by *every* page
   (`index/login/register/checklist/profile` are fully self-contained inline),
   so either create a small `tokens.css` that every page links, or replicate the
   same `:root` block. Prefer `tokens.css` — that is the actual root cause of
   the drift.
2. Map each page's current value to the nearest scale step:
   - 10px → 12px (`login`, `register`)
   - 14px → 12px (`checklist-preview`)
   - 16px `--radius` → `--radius-lg` (`checklist`, `profile`) — these want the
     larger step, so rename rather than shrink
   - `--radius-sm: 10px` → 8px (`checklist`, `profile`)
3. Replace `checklist.html`'s hardcoded 14/16/24px with scale steps. The 24px
   weather hero is the most visually out-of-place; 16px (`--radius-lg`) is the
   likely landing spot.
4. **Verify visually.** This changes appearance on nearly every page. Check at
   1440px and 375px: landing, login, register, dashboard, my-trips, checklist,
   profile, admin.

### Risk

Cosmetic only — no behavioural or security surface. But it touches many files,
so land it as its own commit, separate from #5, to keep the diff reviewable and
easy to revert.

---

## #5 — Cleanup batch

Independent items; any order. Roughly cheapest first.

1. ~~**Dead CSS from the checklist merge.**~~ Done — also removed a duplicate
   `computeProgress()` found alongside it.

   <details><summary>original notes</summary>

   **Dead CSS from the checklist merge.** Merging the AI gear list left orphaned
   selectors in `checklist.html`. Verified by counting CSS rules vs markup uses:

   | selector | css refs | markup refs | |
   |---|---|---|---|
   | `.sg-list` | 2 | 0 | dead |
   | `.sg-filters` | 1 | 0 | dead |
   | `.sg-legend*` | 4 | 0 | dead |
   | `.sg-ai-badge` | 1 | 1 | keep |
   | `.sg-empty*` | 4 | 5 | keep |
   | `.sg-generate-btn` | 3 | 1 | keep |
   | `.sg-summary` | 0 | 1 | see below |

   `.sg-summary` has no rule of its own — it renders fine because its contents
   use `.sg-empty__hint`. Either give it a rule or leave it; harmless.

   </details>

2. ~~**Ragged park-card row (dashboard).**~~ Done — titles clamped to one line;
   all rows now uniform at 244px.

   original: **Ragged park-card row (dashboard).** Row 2 of "Top National Parks" mixes
   255px and 274px card heights because one title ("White Mountain National
   Forest") wraps to two lines and stretches its grid row. Fix with
   `min-height` on `.disc-card-body`, or clamp titles to one line.

3. ~~**`DELETE /items/:id` requires `tripId` in the request body.**~~ Done —
   accepts `?tripId=` as well, and now answers 404 instead of a false 200 when
   nothing matched.

4. ~~**Rename `services/dynamoDBService.js`.**~~ Done — now `dataService.js`,
   with both requires and the local bindings updated.

5. **Portfolio cosmetics** (separate repo, `~/Desktop/Portfolio`):
   - three tag treatments — `.chip` (cyan, project tech), `.proj-tag` (amber,
     category), `.skill-tags span` (neutral). Possibly intentional; decide.
   - hamburger icon never changes state (stays `☰` when open), no backdrop
   - timeline date column is 140px and both dates wrap to two lines
   - project cards squeeze at ~860–1000px (info column drops to ~332px)
   - About card floats with ~166px of dead space beside the text column

---

## Deferred deliberately

- **`weather.js` test coverage (5%).** Mostly a thin wrapper over Open-Meteo /
  OpenWeather with little branching worth pinning.
- **TrailPack `main` branch.** Still the pre-migration unrelated history (tip
  `cb699f9`). Harmless now that `dev` is the GitHub default.
- **Checklist category vocabulary.** Settled at six categories — do not collapse
  to three. `__tests__/checklistCategories.test.js` enforces it and scrapes
  `routes/trips.js` so a new category there fails the build.

## Conventions being followed

- Commit and push at every checkpoint; CI must stay green.
- Write a regression test whenever a real bug is found (not for coverage gaps
  alone), and prove the test fails against the old behaviour.
- Verify in the browser for anything visual — the backend suite does not cover
  rendering.
- Flag anything security-relevant explicitly.
- Delete any test data created against production Atlas immediately.
