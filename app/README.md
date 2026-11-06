# Marbler's new interface (mockup)

A clickable mockup of the redesign in `../docs/redesign-plan.md`. It isn't connected to the tank yet: `src/ui/useMockTank.js` stands in for `TankController`, using the same settings keys.

    npm install
    npm run dev          # the app, on http://localhost:8020
    npm run storybook    # every layout and part, on http://localhost:6006
    npm run fixtures     # after tools.js, info.js, models.js, palettes.js or the examples change

`src/fixtures/controls.json` is copied from those files by `scripts/fixtures.mjs`, so the mockup shows every real tool, setting, simulator, palette and example without importing the old interface.

- `src/desktop/` is the desktop layout: menus, settings bar, tool rail, panels, transport bar and script drawer.
- `src/phone/` is the phone layout: tank on top, thumb strip, sheets.
- `src/ui/` holds what both share, including the tool groups and the draft of which settings Simple view shows (`SIMPLE` in `controls.js`).
