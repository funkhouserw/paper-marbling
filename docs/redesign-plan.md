# UI redesign plan

**Status (7 Nov 2026):** built and connected to the real tank on the `ui-connect` branch, which is `tank-controller` (the separated tank logic) with `ui-redesign` (the interface) merged in. `main` keeps the current interface until Ilse decides to switch. Not pushed. See "Where it stands" below.

## Goal
A nicer interface for people to experiment and play with. It should work on a desktop and on a phone.

## Decided
- **Stack:** React, Tailwind and Storybook. `npm install` is fine.
- **No Claude Design:** we design directly in code and Storybook.
- **Desktop layout:** Photoshop's structure with a modern look: menus, a tool rail, a settings bar, the tank, panels and a transport bar.
- **Simple and Advanced views:** Simple is the default. Switching only hides controls, and never changes the tank or its settings.
- **Default simulator:** Wake. Viscosity stays visible in Simple.
- **Assistant:** becomes a small pop-up creature that also answers questions, replacing the sidebar panel. On the public demo, the AI is simply absent, and the interface doesn't depend on it.
- **Scripts:** an Advanced feature that gets its own drawer instead of a sidebar panel.
- **Mobile:** we want real phone support.

## What has to fit
16 tools with 77 settings between them, 7 simulators, about 89 page elements with IDs, and panels for palette, history, script, saved states, Moving bath, Detail, paper and export. Today's `ui.js` is about 2,200 lines, mixing the controls with the tank's control logic.

## Desktop
```
┌────────────────────────────────────────────────────────┐
│ File  Edit  Tank  View  Help             Simple|Advanced│
├────────────────────────────────────────────────────────┤
│ Rake:  Teeth [10]  Pull [===]  Speed [===]             │
├────┬──────────────────────────────────────┬────────────┤
│Ink │                                      │ Palette    │
│Comb│                                      │ History    │
│Move│               the tank               │ Saved      │
│Lift│                                      │ Prints     │
├────┴──────────────────────────────────────┴────────────┤
│ ▶ Pause  Speed 1×  Viscosity [===]   t 12 s · 80 shapes│
└────────────────────────────────────────────────────────┘
```

Tool groups:
- **Ink:** Drop, Spray, Fill dots, Paint, Stripes, Text
- **Comb:** Rake, Full rake, Hearts, Stylus
- **Move:** Jiggle, Wriggle, Stir, Vortex, Air
- **Lift:** Eraser, plus Freeze as a mode

## Script drawer
- **Opening it:** a Script button or a keyboard shortcut, from anywhere, in Advanced view. No scrolling.
- **Desktop:** slides in from the right and can be resized. The tank shrinks to fit beside it, so you can watch a script run while you edit it.
- **Inside:** a large editor, Run with Clear tank first, Examples, My scripts, Copy session to script, and errors shown where you can see them.
- **Phone:** a sheet that stops at half height, with the tank still showing, or goes full height for editing.
- **Local assistant:** script-writing replies land here.

## Phone
The pattern is Lightroom and CapCut: the canvas stays on top, a thumb-reach strip sits at the bottom, and tapping it raises settings without covering the canvas.

```
┌──────────────────┐
│ ☰   ↶ ↷    ▶     │
│                  │
│    the tank      │
│                  │
│ ●●●●●●  palette  │
│ Teeth    [====]  │  settings: swipe sideways for more
│ Pull     [==  ]  │
│ Ink Comb Move Lift│  tap a group for its tools
└──────────────────┘
```

- **Gestures:** one finger uses the tool, two fingers pan and zoom, and a two-finger tap undoes.
- **Tank shape:** add a portrait preset, since a 1000 × 700 tank leaves a phone's screen half empty.
- **(i) help:** tap to open as a small sheet.
- **Exports:** use the phone's share sheet.
- **Landscape phones:** the rail moves to the left and settings to the right.
- **Tablets:** the desktop layout, with touch gestures.

## The biggest mobile risks
These are unmeasured so far, so they get checked first.
1. **Speed:** simulation runs on the page's main thread, so a heavy tank would freeze touch input. Moving it to a worker may be necessary, and that's a large change. A lower point limit or Wake (fast) may be enough.
2. **Memory:** undo keeps up to 500 MB, and the point limit is tuned for laptops. Phones would need lower limits for both.
3. **Grid ink:** it needs two WebGL float extensions (`gridgl.js:205`) and falls back to the much slower CPU version without them. Phones may need the half-float fallback we previously set aside.

## The creature
- **Shape:** a small animated ink drop in a corner. Tapping it opens a chat panel on desktop or a sheet on a phone, which gives chat real room and frees up the sidebar.
- **Answering questions:** an FAQ written from How it works, searched in the browser. This costs nothing, needs no key and works on the public demo.
- **Writing scripts:** only appears when running locally with your own API key. The public demo doesn't show it at all.
- **Later, if wanted:** AI answers on the demo need a hosted key, login or rate limits, and a budget.
- **Respect "reduce motion":** it stays still for people who've asked for that.

## Build order
1. **Phone check.** Try the current demo build on a real phone with Wake, and measure. This decides how much of the mobile work is needed.
2. **Scaffolding.** React, Tailwind and Storybook on this branch, with the simulators untouched.
3. **Clickable mockup.** The desktop and phone layouts in Storybook, unconnected to the tank. **Stop here for Ilse to try it.**
4. **Separate the tank logic.** Pull a controller out of `ui.js`, with no change in behaviour, so any interface can drive it.
5. **Connect desktop.** Tools, settings, panels and the transport bar, generated from `tools.js` and `info.js` so they stay complete.
6. **Simple and Advanced.**
7. **The creature and FAQ.**
8. **Phone layout and gestures,** with whatever step 1 showed is needed.
9. **Check against the old interface.** Every control still has a home, and all tests pass. **Then Ilse decides whether to merge.**

## Where it stands
Steps 2–7 are done, and most of 8 and 9.
- **Running it:** `npm run dev` in `app/` (port 8020 by default), or `npm run build` in `app/` and then `node server.mjs`, which serves it at `/new/` beside the old page. `?mock` shows the picture-only mockup, and `npm run storybook` shows every layout.
- **The tank:** `controller.js` holds the tank logic, `tankview.js` draws it with all the old previews, and `pageactions.js` handles pulls, exports, saves, my scripts, palettes and the assistant. The old page uses the same three files, and a 49-step browser session shows it unchanged.
- **Nothing left behind:** `app/coverage.test.mjs` fails if any old element id, info.js explanation, tools.js tool or controller setting has no home in the new interface.
- **Adding things:** `app/README.md` says what a new setting, action, panel or tool takes. Tools are table-driven in `tools.js`, so a new brush needs no controller code, and it shows up in the interface on its own.
- **Extras beyond the old page:** a right-click (long-press) tank menu, ⌘K to find any command, shortcuts listed in the menus, pictures for the weave shapes, panels that fold away on narrower screens, and an in-browser FAQ for the ink drop on the demo.
- **Still to do:** two-finger pan and zoom and a two-finger tap for undo on phones (tankview's touch handling is being added); a full browser comparison against the old page (review 2); a real-phone speed check (step 1).

## Decided along the way
- CodeMirror for the script editor, JavaScript rather than TypeScript, and lucide icons.
- The built interface is served by `node server.mjs` at `/new/`; `app/dist` isn't committed.
- Wake is the new interface's default simulator unless one was chosen before.
- Simple view keeps spray's colours, stir, vortex and wriggle direction, and the weave shape, because the tools need them.

## Open questions
- Should a phone start on a portrait tank? A 1000 × 700 tank leaves half a phone screen empty.
- Should Simple use Wake (fast) underneath on phones?
- What's the creature's name and look? It's a teal ink drop with eyes for now.
- When to switch: make `/new/` the main page, keep the old one at a side address for a while, or replace it outright.
