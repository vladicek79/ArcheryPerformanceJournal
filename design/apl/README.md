# APL

**Archery Performance Journal** — the design system of the APL app: a phone-first interface, dark by default with a matching light theme, for logging training sessions at the range. Derived from the "New session" setup screen.

## Principles

- **Thumb-first.** Everything tappable is at least `tap-min` (44px); the primary action is a full-width `tap-primary` (56px) button pinned to the bottom bar (`surface-bar`), always in reach.
- **One tap over typing.** Prefer chips and presets for common values (distances, arrows per end) and keep a compact −/+ stepper for anything in between. Dropdowns are a last resort.
- **Remember the archer.** Lead forms with a "Same as last session" card and pre-select sensible defaults (e.g. the standard face for the chosen distance), marking them with a "Suggested" badge.
- **Show, don't list.** When a choice has a visual meaning (a target face), show a live preview next to the controls.
- **Quiet chrome, one accent.** Neutral surfaces in either theme; `accent` green marks only selection and the primary action.

## Content

- Sentence case for titles and buttons ("Start session", "Add equipment"). Section labels are UPPERCASE in the `label` style.
- Always show units, separated by a space: `18 m`, `40 cm`, `3 arrows`.
- Use the en dash for ranges: `10–6`.
- A summary line joins facts with ` · ` — `18 m · 40 cm triple · 3 arrows/end · Recurve`.
- No emoji.

## Colour

- Ground `ground`, cards and controls `surface` with a 1px `border`; wells use `surface-sunken`.
- Text: `ink` primary, `ink-soft` secondary values, `muted` for labels and captions.
- **Selected** chip or segment: fill and border `accent`, text `on-accent`. **Unselected**: `surface` fill, `border`, `ink` text.
- **Selected card** (radio-style list item): `accent-tint` fill, `accent` border, radio ring and dot `accent-bright`. Unselected ring `radio-off`.
- Accent as text or icon always uses `accent-bright` (mint in dark, deep green in light), never `accent`.

### Themes

Two themes share every token name: **Dark** (default, for indoor ranges and evenings) and **Light** (for outdoor ranges in daylight, where glare washes out dark screens). Switch with `data-theme="dark"|"light"` on `<html>`; follow `prefers-color-scheme` when the user picks System. Light keeps the same accent fill (`accent` #0b7a55, 5.3:1 with white), turns surfaces white on a soft grey `ground`, and uses darker borders (`border` 3.5:1) so controls stay visible in sunlight. `target-*` colours are identical in both themes — a target face never changes.
- `target-*` colours are for drawing target faces and score data only — never for UI state. The red ring is not an error colour.

## Typography

Inter (Google Fonts, weights 400/500/600/700), falling back to the system UI font. Sizes are small and few: `screen-title` 20, `value-lg` 22, `button-lg` 17, `count` 18, `body-strong`/`body` 15, `label` 13 uppercase +0.06em, `caption` 12.

## Spacing and shape

Screen padding `space-5` (16px); sections separated by `space-6` (22px); label-to-control `space-3`; chips gap `space-2`; card padding `space-4`. Radii: `radius-sm` segments, `radius-md` chips, `radius-lg` inputs and list cards, `radius-xl` feature cards and the primary button, `radius-pill` badges and steppers. No shadows: elevation is expressed by surface colour and borders.

## Patterns

- **Section:** `label` heading, optional right-aligned accessory (stepper or "Suggested" badge), then the control.
- **Chip grid:** `repeat(4, minmax(0,1fr))`, height 48 (52 for numeric `count` chips), `radius-md`.
- **Segmented control:** `surface` track with `border`, `space-1` padding, segments 44px tall at `radius-sm`; selected segment `accent`.
- **Compact stepper:** pill, `surface`, 44×40 −/+ buttons around a `body-strong` value.
- **Repeat card:** `accent-tint` with `accent-tint-border`, 40px icon well in `accent-icon-bg`, title + `caption` summary, trailing "Use" in `accent-bright`.
- **Add button:** dashed `border-dashed`, transparent, `accent-bright` label with a plus icon.
- **Bottom bar:** `surface-bar`, top hairline `border-soft`, `caption` summary centred above the primary button.

## Components

All components live in `window.APL` (React 18): Button, IconButton, AddButton, Chip, ChipGrid, OptionPills, SegmentedControl, Stepper, SelectCard, Badge, Icon, TargetFace, FaceCard, ScreenHeader, Section, RepeatCard, FieldButton, BottomBar. `SessionSetup` is a full example screen composed only from them. Styles come from `components/bundle.css` (classes prefixed `apl-`).

## Icons

Inline stroke icons, 20–22px, 2px stroke, round caps and joins, `currentColor`. Leading icons in fields use `accent-bright`. Icon-only buttons carry an `aria-label`.

## Accessibility

Real `<button>` elements with `aria-pressed` for chips and segments; groups labelled with `role="group"` + `aria-label`. Text contrast ≥ 4.5:1 on its surface (`muted` on `surface`: 7.6:1 dark, 6.2:1 light; white on `accent`: 5.3:1).
