source visual truth path: C:\Users\hitoa\OneDrive\Codex Screenshots\antEX-nursery-ui-concepts-20260703\01-queue-hero-desktop.png
implementation screenshot path: C:\Users\hitoa\Documents\Codex\antEX\verification\ui\barracks-implementation-pass7.png
viewport: 1366x768 desktop
state: normal app, barracks tab open, debug-only screenshot state with 6 nursery queue orders
full-view comparison evidence: C:\Users\hitoa\Documents\Codex\antEX\verification\ui\barracks-reference-vs-pass7.png
focused region comparison evidence: full-view comparison is sufficient because the target surface is the full barracks panel and all controls are readable at 1366x768

**Findings**
- No actionable P0/P1/P2 findings remain.

**Residual P3 Differences**
- The implementation keeps antEX's real map vision and dark unexplored area, while the generated reference shows a more broadly visible map. This is intentional because current gameplay rules require strong dark fog outside vision.
- The generated reference includes a small lower strip for eggs/waiting/cocoon-like counts. The current game state has no durable data model for those values, so the implementation uses a truthful rule note instead of inventing fake counters.
- Top HUD values and ordering follow the real app rather than the generated mock's high-population display.

**Required Fidelity Surfaces**
- Fonts and typography: Uses the existing Inter/Yu Gothic UI stack and compact HUD sizing. The new queue headers, labels, and buttons match the existing antEX typographic rhythm while preserving readable Japanese labels.
- Spacing and layout rhythm: The barracks panel now follows the reference hierarchy: tabs, queue hero, recommendations, rule note. Pass 7 keeps the panel compact on desktop without splitting Japanese labels vertically.
- Colors and visual tokens: Uses existing translucent charcoal panel surfaces, teal active accents, amber progress/cost cues, 7-8px radii, and thin divider borders.
- Image quality and asset fidelity: Uses existing generated project assets for ant/role icons instead of CSS drawings or placeholders. No new raster asset is required.
- Copy and content: Keeps player-facing "育房", "育成キュー", "次に育てる", "出撃は軍事タブから行います", and queue cap 30. It avoids old expedition-mode copy inside the nursery.

**Patches Made Since Previous QA Pass**
- Replaced the dense all-variant card-first barracks layout with a queue-first hero and three recommended training choices.
- Added role icon mapping for nursery training variants.
- Hid the panel header and metric grid only while the barracks tab is active, matching the reference image's direct tab-to-queue structure.
- Tightened card and queue-slot vertical density, then relaxed barracks max-height after screenshot verification showed bottom clipping.
- Added a folded "all training variants" section so the visible first screen stays close to the reference while every ant type remains reachable.
- Tuned the desktop-only barracks width and card density after pass 6 showed over-tight vertical Japanese label wrapping.
- Added responsive stacking for the queue hero and recommendation cards on mobile.

**Implementation Checklist**
- Queue hero visible before training choices.
- Active training progress and six queue slots visible.
- Three recommended training choices visible with plus buttons.
- Disabled choices keep a reason in button title/aria-label.
- All training variants remain present under the folded section, preserving the real nursery rules.
- Existing training queue behavior and queue cap remain unchanged.

**Verification**
- `npm.cmd run check`: passed.
- `npm.cmd run test`: passed, 6 files / 30 tests.
- `npm.cmd run eval:smoke`: passed, 84 tests.
- `npm.cmd run eval:save`: passed, 4 tests.

final result: passed

---

## 2026-07-04 Military Sortie Board QA

source visual truth path: C:\Users\hitoa\OneDrive\Codex Screenshots\antEX-military-ui-ideas-20260703\02-sortie-composition-board.png
implementation screenshot path: C:\Users\hitoa\Documents\Codex\antEX\verification\military-ui-20260704\desktop-final.png
mobile expanded screenshot path: C:\Users\hitoa\Documents\Codex\antEX\verification\military-ui-20260704\mobile-expanded-final.png
mobile actions screenshot path: C:\Users\hitoa\Documents\Codex\antEX\verification\military-ui-20260704\mobile-actions-final.png
viewport: 1365x768 desktop, 390x844 mobile
state: military tab open, discovered enemy nest, 84 total combat soldiers, manual plan 12 / 42, cooldown state checked
full-view comparison evidence: source concept and desktop-final screenshot were inspected side by side in Codex visual review
focused region comparison evidence: C:\Users\hitoa\Documents\Codex\antEX\verification\military-ui-20260704\desktop-final.png covers the sortie table, enemy nest card, CTA buttons, and rule note in one view

**Findings**
- No actionable P0/P1/P2 visual findings remain for the military board.

**Residual P3 Differences**
- The reference image shows a cooldown value while the expedition CTA still appears active. The implementation keeps the existing game rule: cooldown disables both sortie buttons. In a no-cooldown browser check, the CTA labels become `防衛出動 12` and `遠征出動 12`.
- Mobile expanded view keeps the full sortie table and enemy card, so the CTA section is reached by internal panel scroll. The scrolled screenshot confirms both buttons remain reachable.
- The enemy nest image uses the existing generated soil-mound asset rather than a bespoke enemy-nest render.

**Required Fidelity Surfaces**
- Fonts and typography: Uses the existing antEX UI stack, compact numeric headers, tab labels, and Japanese role copy.
- Spacing and layout rhythm: Matches the source hierarchy: tabs, sortie metrics, role rows, target card, paired sortie CTAs, and rule note.
- Colors and visual tokens: Preserves translucent charcoal panels, teal active military accents, amber/red risk cues, thin dividers, and 7-8px radii.
- Image quality and asset fidelity: Uses existing generated UI assets for defense, military, warning, role, and target imagery.
- Interaction: The `+/-` controls now update a runtime sortie plan. Browser check confirmed `12 / 42 -> 13 / 42 -> 12 / 42`, and the sortie CTAs read the selected count.

**Patches Made Since Previous QA Pass**
- Replaced the old military summary grid with a sortie-composition board and discovered-enemy-nest card.
- Added runtime-only manual sortie planning by role, capped by available in-nest soldiers and the existing one-wave limit.
- Connected the manual plan to actual defense/expedition deployment composition without changing save data.
- Hid unrelated metric/log surfaces while the military tab is active so the board matches the reference density.
- Added responsive stacking and internal-scroll verification for mobile.

**Verification**
- `npm.cmd run test`: passed, 6 files / 30 tests.
- Browser visual QA: passed for desktop military board and mobile reachability.
- Browser interaction QA: passed for sortie count stepper and CTA count binding.
- `npm.cmd run eval:save`: passed, 4 tests.
- `npm.cmd run eval:smoke`: blocked by 9 existing non-military failures in barracks, construction, and one camera zoom expectation. Military sortie smoke tests passed.
- `npm.cmd run verify:balance`: blocked by timeout. A 180s run and a 360s run both produced partial scenario summaries but did not reach `verification/balance/summary.json` generation.

final result: blocked

---

## 2026-07-04 Construction Field Sheet QA

source visual truth path: C:\Users\hitoa\OneDrive\Codex Screenshots\antex-construction-ui-concepts-20260703\01-field-command-sheet.png
implementation screenshot path: C:\Users\hitoa\Documents\Codex\antEX\verification\construction-ui-20260704\iteration-08.png
viewport: 390x844 mobile
state: construction tab open, earthWall placement pending, 3 wall points drafted, trailReinforce task at 62%, 3 builders assigned
full-view comparison evidence: C:\Users\hitoa\Documents\Codex\antEX\verification\construction-ui-20260704\comparison-08.png
focused region comparison evidence: full-view comparison is sufficient because the construction sheet, placement panel, and active work row are all visible and readable in iteration-08.

**Findings**
- No actionable P0/P1/P2 visual findings remain for the construction menu.

**Residual P3 Differences**
- The generated reference uses a photographic top-down dirt scene with a prominent cyan wall line. The implementation keeps antEX's real 3D game camera, top HUD, and existing terrain visibility instead of changing the game shell for a menu-only visual match.
- The implementation uses existing generated project thumbnails for construction kinds, so the soil-wall/barricade art is consistent with the app asset set rather than an exact crop of the generated concept.
- The active task target displays `目標 3/8` because the verified state has 8 available builder ants. The game rule still caps each task within the 1-10 range.

**Required Fidelity Surfaces**
- Fonts and typography: Uses the existing antEX UI stack with larger tab labels, compact command subtitles, and amber cost/progress numerals matching the reference hierarchy.
- Spacing and layout rhythm: Matches the reference order: tabs, builder summary strip, four command rows, earth-wall placement panel, then active work row.
- Colors and visual tokens: Preserves translucent charcoal sheets, teal active construction accent, amber cost/progress cues, thin dividers, and 7-8px radii.
- Image quality and asset fidelity: Uses existing generated construction thumbnails and avoids placeholder SVGs.
- Copy and content: Keeps construction rules truthful: earth-wall cost varies by length, and construction time is described as changing by soil gathering, travel, and assigned builders rather than fixed seconds.

**Patches Made Since Previous QA Pass**
- Reworked the construction summary into an inline field-sheet strip with idle builder count.
- Converted construction commands into image-led rows with cost blocks and active earth-wall state.
- Added an earth-wall placement panel with draft mini-line, cancel, and confirm actions.
- Added active work rows with progress, area label, and builder target controls.
- Moved the panel toggle out of the construction sheet path and tightened mobile density so the active work row remains visible.

**Implementation Checklist**
- Earth-wall command row shows active teal treatment during placement.
- Placement panel exposes drafted point count, variable cost, variable-time note, cancel, and confirm actions.
- Active construction row shows progress, assigned builders, target controls, and non-fixed time wording.
- Existing construction command strings required by smoke tests remain present.

**Verification**
- `npm.cmd run check`: passed.
- `npm.cmd run test`: passed, 6 files / 30 tests.
- Browser visual QA: passed against `iteration-08.png` and `comparison-08.png`.
- Construction smoke coverage: construction tests passed in the full smoke attempt after the `担当 3/3` text restoration.
- `npx.cmd playwright test tests/playwright/smoke.spec.ts -g "heavy soldiers brace|sortied soldiers intercept|expanded nest upgrade tree|rival raids warn|sentry mounds reveal|rival ant combat grapples|raid rivals keep|rival ants actively"`: passed, 16 tests.
- `npm.cmd run eval:smoke`: blocked as a full command by intermittent eval-server `ERR_CONNECTION_REFUSED`, not by construction UI assertions.

final result: passed
