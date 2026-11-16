# SessionSetup

Example screen: the mobile "New session" form that sets up a training session, composed only from APL components (`<APL.SessionSetup />`). Interactive in the preview.

## What it shows

- **Repeat card** at the top: reuses the archer's last setup in one tap.
- **When**: two 56px field buttons (date, time) with `accent-bright` leading icons.
- **Distance**: 4-column chip grid of common distances plus a compact pill stepper for anything in between.
- **Target face**: live preview card (`surface-sunken` well, `target-*` colours), a size segmented control, and wrapping type pills limited to valid combinations. Picking a distance pre-selects the usual recurve face and shows a "Suggested" badge until the archer overrides it.
- **Arrows per end**: numeric chips (`count` style, 52px).
- **Equipment**: radio-style cards (`accent-tint` when selected) and a dashed "Add equipment" button.
- **Bottom bar**: `surface-bar` with a one-line summary and the 56px primary button.

## Use it as a reference for

Any APL form screen: keep section order top-to-bottom by how often the value changes, keep the primary action in the bottom bar, and prefer chips over dropdowns.

The consumer provides real data (last session, saved equipment, current date and time); the bow detail line here is a placeholder.
