# Marbler's new interface

React, Tailwind and Storybook, driving the same `TankController` (`../controller.js`) as the old page. The plan is in `../docs/redesign-plan.md`.

    npm install
    npm run dev          # the app, on http://localhost:8020 (add ?mock for the picture-only mockup)
    npm run storybook    # every layout and part, on the mock tank, on http://localhost:6006
    npm test             # coverage.test.mjs: nothing from the old page left behind
    npm run fixtures     # after tools.js, info.js, models.js, palettes.js, text.js or the examples change

## Where things are

- `src/ui/features.js` lists every feature apart from the tools: panel sections, their controls, and every action with its menu, shortcut and whether it's in the tank's right-click menu. Plain data, so node can test it.
- `src/ui/controls.js` holds the tool icons and which settings Simple view shows. The tools themselves come from `tools.js`, through `src/fixtures/controls.json`.
- `src/ui/sections.jsx` draws a section's controls; `src/ui/commands.jsx` runs actions, shortcuts, the right-click menu, ⌘K and notices.
- `src/desktop/` and `src/phone/` are the two layouts. Both are drawn from the lists above.
- `src/tank/useTank.js` connects to the real `TankController`; `src/ui/useMockTank.js` is the stand-in Storybook uses. Both give the layouts the same shape.

## Adding things

**A setting.** If the tank reads it, add it to `SETTINGS` in `../controller.js` (with its `store` key if it's kept between visits), and any commit method to `COMMIT` in `src/tank/useTank.js`. Then add a control with the same id to a section in `features.js`, and its explanation to `../info.js`. It appears in the desktop panel and the phone's menu sheet. The tests fail until all of those agree.

**An action** (a menu item, button or right-click entry). Add it to `ACTIONS` in `features.js` with its `menu`, and a `shortcut` or `context: true` if wanted, then what it does in `perform` in `src/tank/useTank.js` (or `src/ui/commands.jsx` for page-only actions). It then shows in its menu, in ⌘K, on its key, and in the right-click menu, with no layout changes.

**A panel.** Add a section to `SECTIONS` with `desktop: 'panel'` and `phone: 'menu'`. A new kind of control needs one more case in `Control` in `sections.jsx`.

**A tool or brush.** Today that's:
1. the engine method that does it, and its script command in `../api.js`;
2. its entry in `../tools.js`: label, hint and settings, which become sliders and choices everywhere by themselves;
3. its explanations in `../info.js`;
4. what a click, drag or Apply does, in `../controller.js` (being made table-driven, so this becomes part of the `tools.js` entry);
5. its place in `TOOL_GROUPS` in `features.js`, and an icon in `ICONS` in `controls.js`.

Until step 5 is done, a new tool still shows up, under More with a sparkle icon, and `npm test` asks for a proper place.

**Where Simple view draws the line.** `SIMPLE` and `SIMPLE_CHOICES` in `controls.js` list the settings each tool shows in Simple; a tool not listed shows its first two.
