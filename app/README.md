# Marbler's new interface

React, Tailwind and Storybook, driving the same `TankController` (`../controller.js`) as the old page. The plan is in `../docs/redesign-plan.md`.

    npm install
    npm run dev          # the app, on http://localhost:8020 (add ?mock for the picture-only mockup)
    npm run storybook    # every layout and part, on the mock tank, on http://localhost:6006
    npm test             # coverage.test.mjs: nothing from the old page left behind

## Where things are

- `src/ui/features.js` lists every feature apart from the tools: panel sections, their controls, and every action with its menu, shortcut and whether it's in the tank's right-click menu. Plain data, so node can test it.
- `src/ui/live.js` reads the tools, explanations, simulators, palettes, fonts and examples straight from the tank's modules. `src/ui/controls.js` adds the tool icons and which settings Simple view shows.
- `src/ui/sections.jsx` draws a section's controls; `src/ui/commands.jsx` runs actions, shortcuts, the right-click menu, ⌘K and notices.
- `src/desktop/` and `src/phone/` are the two layouts. Both are drawn from the lists above.
- `src/tank/useTank.js` connects to the real `TankController`; `src/ui/useMockTank.js` is the stand-in Storybook uses. Both give the layouts the same shape.

## Adding things

**A setting.** If the tank reads it, add it to `SETTINGS` in `../controller.js` (with its `store` key if it's kept between visits), and any commit method to `COMMIT` in `src/tank/useTank.js`. Then add a control with the same id to a section in `features.js`, and its explanation to `../info.js`. It appears in the desktop panel and the phone's menu sheet. The tests fail until all of those agree.

**An action** (a menu item, button or right-click entry). Add it to `ACTIONS` in `features.js` with its `menu`, and a `shortcut` or `context: true` if wanted, then what it does in `perform` in `src/tank/useTank.js` (or `src/ui/commands.jsx` for page-only actions). It then shows in its menu, in ⌘K, on its key, and in the right-click menu, with no layout changes.

**A panel.** Add a section to `SECTIONS` with `desktop: 'panel'` and `phone: 'menu'`. A new kind of control needs one more case in `Control` in `sections.jsx`.

**A tool or brush.** The controller has no per-tool code, so it's:
1. the engine method that does it;
2. its entry in `../tools.js`: label, hint, settings, `input` ('click', 'stroke', 'line' or 'whole') and `act`, which calls the engine. Its settings become sliders and choices everywhere by themselves;
3. its explanations in `../info.js`, as `tool.<name>` and `<name>.<setting>`;
4. its script command in `../api.js`, if scripts should reach it;
5. its place in `TOOL_GROUPS` in `features.js`, and an icon in `ICONS` in `controls.js`.

A preview drawn over the tank while you use it (as rake, full rake, hearts and text have) is a hand edit in `../tankview.js`.

Until step 5 is done, a new tool still shows up, under More with a sparkle icon, and `npm test` asks for a proper place.

**Simple view** shows every brush setting. It hides advanced panel sections and controls, marked `view: 'advanced'` in `features.js`.
