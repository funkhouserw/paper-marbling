// Every feature of the interface apart from the tools, declared once. The layouts are drawn from
// this list, so adding something here puts it in the desktop panels, the phone menu, the menus,
// the command palette and the keyboard shortcuts without touching any layout.
//
// Control ids are the old page's element ids, which are also TankController's settings keys, so
// connecting the tank later is a lookup. `replaces` lists any other old ids a control stands for,
// and coverage.test.mjs checks that every old id has a home here or in LAYOUT_ONLY.
//
// Plain data on purpose, so node can check it without a browser.

// Where a section goes on each layout.
//   desktop: 'panel' (right side), 'tankPanel' (inside the Advanced Tank panel), 'drawer', 'creature'
//   phone:   'menu' (a tab of the ☰ sheet), 'drawer', 'creature'
// view: shown in Simple and Advanced ('simple') or Advanced only ('advanced').
// when: only while the tank can do it: a key of TankController.capabilities() (erase, hearts, freeze,
//   tile, tileOffset, walls, flow), 'gridink', or 'local' (running on your own server, not the demo).
// showIf: only while these settings have these values.
//
// Numbers here (value, min, max, step) are stand-ins until controller.js exports its SETTINGS spec;
// they match the old page today.

// Where each tool from tools.js sits, in the desktop rail and the phone's group tabs.
export const TOOL_GROUPS = [
  { id: 'ink', label: 'Ink', tools: ['drop', 'heartDrop', 'broom', 'spray', 'fillDots', 'paint', 'stripes', 'text'] },
  { id: 'comb', label: 'Comb', tools: ['rake', 'drawnRake', 'fullRake', 'hearts', 'stylus'] },
  { id: 'move', label: 'Move', tools: ['jiggle', 'wriggle', 'stir', 'vortex', 'air'] },
  { id: 'lift', label: 'Lift', tools: ['erase'] },
];

export const SECTIONS = [
  {
    id: 'palette', label: 'Palette', icon: 'palette', info: 'palette', desktop: 'panel', phone: 'menu', view: 'simple',
    controls: [
      { id: 'palette', kind: 'palette', label: 'Palette', info: 'palette' },
      { id: 'useBath', kind: 'colourToggle', label: 'Base colour', info: 'baseColour', colour: 'bath', replaces: ['bath'] },
      { id: 'editPalettesButton', kind: 'action', action: 'editPalettes', view: 'advanced' },
    ],
  },
  {
    // Opened from Edit palettes…, in a window of its own so the Palette panel stays short.
    id: 'palettes', label: 'Palettes', icon: 'palette', info: 'myPalettes', desktop: 'modal', phone: 'modal', view: 'advanced',
    controls: [
      { id: 'palettePick', kind: 'palette', label: 'Palette', info: 'palette' },
      { id: 'inkColour', kind: 'inkEditor', label: 'Next drop\'s ink', info: 'color.swatches', view: 'advanced', infos: ['color.alpha', 'color.shimmer'] },
      { id: 'paletteEditor', kind: 'paletteEditor', label: 'Edit and save', inline: true, info: 'myPalettes', view: 'advanced', replaces: ['paletteInks', 'addInk', 'paletteName', 'savePalette', 'deletePalette'] },
    ],
  },
  {
    id: 'history', label: 'History', icon: 'history', desktop: 'panel', phone: 'menu', view: 'simple',
    controls: [{ id: 'history', kind: 'history', label: 'History' }],
  },
  {
    id: 'saved', label: 'Saved states', icon: 'bookmark', info: 'savedStates', desktop: 'panel', phone: 'menu', view: 'simple',
    controls: [
      { id: 'saveState', kind: 'action', action: 'saveState' },
      { id: 'saves', kind: 'gallery', label: 'Saved states', empty: 'Nothing saved yet.' },
    ],
  },
  {
    id: 'paper', label: 'Paper', icon: 'printer', info: 'pull', desktop: 'panel', phone: 'menu', view: 'simple',
    controls: [
      { id: 'pull', kind: 'action', action: 'pull', primary: true },
      { id: 'tints', kind: 'tints', label: 'Paper colour' },
      { id: 'imperfection', kind: 'slider', label: 'Imperfections (%)', info: 'imperfection', value: 50, min: 0, max: 100, step: 5, replaces: ['imperfectionValue', 'pullOptions'] },
      { id: 'pullBase', kind: 'toggle', label: 'Use base colour as the paper', info: 'pullBase', value: false, view: 'advanced' },
      { id: 'clearAfter', kind: 'toggle', label: 'Clear tank after pull', info: 'clearAfter', value: false },
      { id: 'mirror', kind: 'toggle', label: 'Mirror like a real print', info: 'mirror', value: false, view: 'advanced' },
      { id: 'autoSave', kind: 'toggle', label: 'Download PNG on each pull', info: 'autoSave', value: true, view: 'advanced' },
      { id: 'gallery', kind: 'gallery', label: 'Prints', empty: 'Prints you pull collect here.', replaces: ['viewer', 'viewerImg', 'viewerSave', 'viewerDelete', 'viewerClose'] },
    ],
  },
  {
    id: 'export', label: 'Export', icon: 'download', info: 'exportButtons', desktop: 'panel', phone: 'menu', view: 'simple',
    controls: [
      { id: 'exportRow', kind: 'actions', actions: ['exportPng', 'exportSvg', 'exportPrint'], replaces: ['png', 'svg', 'print'] },
      { id: 'printPale', kind: 'toggle', label: 'Thin ink looks paler', info: 'printPale', value: true, view: 'advanced' },
      { id: 'printTexture', kind: 'toggle', label: 'Rims and texture', info: 'printTexture', value: true, view: 'advanced' },
      { id: 'printSoft', kind: 'slider', label: 'Soft edges', info: 'printSoft', value: 0, min: 0, max: 100, step: 1, view: 'advanced', replaces: ['printSoftValue'] },
      { id: 'printProgress', kind: 'status', label: 'Print progress', replaces: ['printResult'] },
    ],
  },
  {
    id: 'tank', label: 'Tank', icon: 'square', desktop: 'panel', phone: 'menu', view: 'simple',
    controls: [
      { id: 'simulator', kind: 'simulator', label: 'Simulator', info: 'simulator' },
      // The moving bath, for the simulators that have one (Wake), under its own heading.
      { id: 'bathHeading', kind: 'heading', label: 'Moving bath', info: 'flowPreset', when: 'flow', view: 'advanced' },
      { id: 'flowPreset', kind: 'choice', label: 'Preset', info: 'flowPreset', value: 'calm', options: { calm: 'Calm: ink stops soon after the tool', curling: 'Curling: long feathers and wobble', whorls: 'Whorls: wakes roll up into spirals', storm: 'Storm: chaos, needs a high point limit', custom: 'Custom' }, replaces: ['bathPanel'], when: 'flow', view: 'advanced' },
      { id: 'flowPush', kind: 'number', label: 'Rake push', info: 'flowPush', value: 1, min: 0, max: 20, step: 0.5, when: 'flow', view: 'advanced' },
      { id: 'flowFriction', kind: 'number', label: 'Floor drag', info: 'flowFriction', value: 0.25, min: 0, max: 10, step: 0.05, when: 'flow', view: 'advanced' },
      { id: 'flowCoast', kind: 'number', label: 'Longest coast (s)', info: 'flowCoast', value: 25, min: 1, max: 600, step: 5, when: 'flow', view: 'advanced' },
      { id: 'flowCell', kind: 'number', label: 'Flow grid (mm)', info: 'flowCell', value: 7, min: 1.5, max: 20, step: 0.5, when: 'flow', view: 'advanced' },
      // Ox gall for the whole bath: each new colour gets a little more than the last (Woolnough's rule).
      { id: 'gallHeading', kind: 'heading', label: 'Ox gall', info: 'gall', view: 'advanced' },
      { id: 'gall', kind: 'toggle', label: 'Rising gall for each colour', info: 'gall', value: false, view: 'advanced' },
      { id: 'gallStart', kind: 'number', label: 'First colour', info: 'gallStart', value: 1, min: 0, max: 10, step: 0.05, showIf: { gall: true }, view: 'advanced' },
      { id: 'gallStep', kind: 'number', label: 'More per colour', info: 'gallStep', value: 0.15, min: 0, max: 3, step: 0.05, showIf: { gall: true }, view: 'advanced' },
      { id: 'gallMost', kind: 'number', label: 'Strongest spread', info: 'gallMost', value: 7, min: 2, max: 50, step: 1, showIf: { gall: true }, view: 'advanced' },
      { id: 'tankHeading', kind: 'heading', label: 'Tank', view: 'advanced' },
      { id: 'tankSize', kind: 'tankSize', label: 'Size (mm)', info: 'tankSize', replaces: ['tankW', 'tankH', 'applyTank'], view: 'advanced' },
      { id: 'walls', kind: 'toggle', label: 'Hard edges', info: 'walls', value: false, when: 'walls', view: 'advanced' },
      { id: 'separate', kind: 'toggle', label: 'Keep cells separate', info: 'separate', value: true },
      { id: 'seam', kind: 'number', label: 'Seam width (mm)', info: 'seam', value: '', min: 0.1, max: 5, step: 0.1, showIf: { separate: true }, view: 'advanced' },
      { id: 'ribbonCut', kind: 'toggle', label: 'Cut hairline ink', info: 'ribbonCut', value: true, view: 'advanced' },
      { id: 'toolsWait', kind: 'toggle', label: 'Tools wait for ink to settle', info: 'toolsWait', value: true, view: 'advanced' },
      { id: 'queueMode', kind: 'choice', label: 'While paused, add', info: 'queueMode', value: 'together', options: { together: 'All at once', order: 'In order', settled: 'Each after the last settles' }, view: 'advanced' },
      { id: 'queueGap', kind: 'number', label: 'Gap (s)', value: 0.5, min: 0, max: 30, step: 0.1, showIf: { queueMode: 'order' }, replaces: ['queueGapLabel'], view: 'advanced' },
      { id: 'lowFramerate', kind: 'toggle', label: 'Low framerate', info: 'lowFramerate', value: false, view: 'advanced' },
    ],
  },
  {
    id: 'repeat', label: 'Repeating', icon: 'grid', info: 'tile', desktop: 'panel', phone: 'menu', view: 'advanced', when: 'tile',
    controls: [
      { id: 'tile', kind: 'toggle', label: 'Repeating', info: 'tile', value: false },
      { id: 'tileOffset', kind: 'choice', label: 'Offset', info: 'tileOffset', value: '', options: { '': 'None', brick: 'Brick', halfDrop: 'Half-drop' }, when: 'tileOffset' },
      { id: 'tilePreview', kind: 'action', action: 'seeRepeat', showIf: { tile: true } },
    ],
  },
  {
    id: 'detail', label: 'Detail', icon: 'gauge', info: 'pointLimit', desktop: 'panel', phone: 'menu', view: 'advanced',
    controls: [
      { id: 'detailPreset', kind: 'choice', label: 'Point limit', info: 'pointLimit', value: '400000', options: { 400000: 'Standard: smooth live play', 2000000: 'High', 5000000: 'Very high', 10000000: 'Extreme', custom: 'Custom' } },
      { id: 'pointLimit', kind: 'number', label: 'Points', value: 400000, min: 50000, max: 20000000, step: 50000, showIf: { detailPreset: 'custom' } },
      { id: 'gridCell', kind: 'number', label: 'Grid ink cell (mm)', info: 'gridCell', value: 2, min: 0.5, max: 10, step: 0.5, when: 'gridink' },
      { id: 'profiling', kind: 'toggle', label: 'Record timings', info: 'profiling', value: false, when: 'local' },
    ],
  },
  {
    id: 'script', label: 'Script', icon: 'code', info: 'script', desktop: 'drawer', phone: 'drawer', view: 'advanced',
    controls: [
      { id: 'examples', kind: 'custom', label: 'Examples' },
      { id: 'myScripts', kind: 'custom', label: 'My scripts', info: 'myScripts', replaces: ['scriptName', 'saveScript', 'deleteScript'] },
      { id: 'script', kind: 'custom', label: 'Script', info: 'script', replaces: ['error'] },
      { id: 'run', kind: 'action', action: 'runScript' },
      { id: 'clearFirst', kind: 'toggle', label: 'Clear tank first', info: 'clearFirst', value: true },
      { id: 'capture', kind: 'action', action: 'copySession' },
    ],
  },
  {
    id: 'assistant', label: 'Ask Carra Jean', icon: 'drop', info: 'assistant', desktop: 'creature', phone: 'creature', view: 'simple',
    controls: [
      { id: 'chatLog', kind: 'custom', label: 'Chat', replaces: ['assistantLocal', 'clearChat'] },
      { id: 'prompt', kind: 'custom', label: 'Your question', replaces: ['generate'] },
      { id: 'mic', kind: 'custom', label: 'Speak', when: 'local' },
    ],
  },
];

// Commands. Each one appears in its menu, in the command palette (⌘K), and with its shortcut.
// `context: true` also puts it in the tank's right-click (long-press on a phone) menu.
export const ACTIONS = [
  { id: 'undo', label: 'Undo', menu: 'Edit', shortcut: '⌘Z', context: true, icon: 'undo' },
  { id: 'redo', label: 'Redo', menu: 'Edit', shortcut: '⇧⌘Z', context: true, icon: 'redo' },
  { id: 'copySession', label: 'Copy session to script', menu: 'Edit', replaces: ['capture'] },
  { id: 'resetAll', label: 'Clear everything…', menu: 'File' },
  { id: 'editPalettes', label: 'Edit palettes…', menu: 'Edit', view: 'advanced' },
  { id: 'savePalette', label: 'Save palette', menu: 'Edit', view: 'advanced' },
  { id: 'deletePalette', label: 'Delete palette', menu: 'Edit', view: 'advanced' },
  { id: 'clear', label: 'Clear tank', menu: 'Edit', context: true, icon: 'trash' },
  { id: 'play', label: 'Play or pause', menu: 'Tank', shortcut: 'Space', icon: 'play' },
  { id: 'finish', label: 'Finish now', menu: 'Tank', info: 'finish', icon: 'finish' },
  { id: 'freezeHere', label: 'Freeze this ink', menu: 'Tank', context: true, info: 'freeze', when: 'freeze', needs: 'point' },
  { id: 'unfreezeHere', label: 'Unfreeze this ink', menu: 'Tank', context: true, when: 'freeze', needs: 'point' },
  { id: 'unfreezeAll', label: 'Unfreeze all', menu: 'Tank', when: 'freeze' },
  { id: 'seeRepeat', label: 'See it repeat', menu: 'Tank', when: 'tile', showIf: { tile: true } },
  { id: 'saveState', label: 'Save state', menu: 'File', shortcut: '⌘S', context: true },
  { id: 'pull', label: 'Pull a print', menu: 'File', shortcut: '⌘P', context: true, icon: 'printer' },
  { id: 'exportPng', label: 'PNG', menuLabel: 'Export PNG', menu: 'File' },
  { id: 'exportSvg', label: 'SVG', menuLabel: 'Export SVG', menu: 'File' },
  { id: 'exportPrint', label: 'Print', menuLabel: 'Export print (slow, high resolution)', menu: 'File' },
  { id: 'runScript', label: 'Run', menuLabel: 'Run script', menu: 'File', shortcut: '⌘↵', view: 'advanced' },
  { id: 'viewSimple', label: 'Simple view', menu: 'View' },
  { id: 'viewAdvanced', label: 'Advanced view', menu: 'View' },
  { id: 'toggleScript', label: 'Script drawer', menu: 'View', shortcut: '⌘E', view: 'advanced' },
  { id: 'commandPalette', label: 'Find a command…', menu: 'Help', shortcut: '⌘K' },
  { id: 'askDrop', label: 'Ask Carra Jean', menu: 'Help' },
  { id: 'patterns', label: 'Traditional patterns', menu: 'Help' },
  { id: 'credits', label: 'Thanks and credits', menu: 'Help' },
  { id: 'howItWorks', label: 'How it works', menu: 'Help', replaces: ['howItWorks'] },
  { id: 'sourceCode', label: 'Source code on GitHub', menu: 'Help', replaces: ['sourceCode'] },
];

export const MENU_ORDER = ['File', 'Edit', 'Tank', 'View', 'Help'];

// Always-on pieces, outside any section. Desktop puts them in the top and bottom bars, the phone
// in its top bar and thumb strip.
export const FIXED = [
  { id: 'play', kind: 'action', action: 'play', replaces: ['paused'] },
  { id: 'speed', kind: 'speed', label: 'Speed', info: 'speed' },
  { id: 'finish', kind: 'action', action: 'finish' },
  { id: 'undo', kind: 'action', action: 'undo' },
  { id: 'redo', kind: 'action', action: 'redo' },
  { id: 'clear', kind: 'action', action: 'clear' },
  { id: 'visc', kind: 'viscosity', label: 'Viscosity', info: 'viscosity', min: 5, max: 20000 },
  { id: 'stats', kind: 'status', label: 'Time and shapes' },
  { id: 'hint', kind: 'status', label: 'Tool hint' },
  { id: 'tools', kind: 'toolRail', label: 'Tools' },
  { id: 'params', kind: 'toolSettings', label: 'Tool settings', replaces: ['apply'] },
  { id: 'freeze', kind: 'freezeRow', label: 'Freeze ink', info: 'freeze' },
];

// Old ids that were only boxes for laying out the page, with nothing to use.
export const LAYOUT_ONLY = {
  stage: 'the whole page', wrap: 'around the tank', tank: 'the tank canvas', overlay: 'previews drawn over the tank',
  transport: 'the top bar', tankBar: 'the tank settings row',
};

// Keys in info.js that aren't for one tool's setting. Tool settings get theirs as `${tool}.${key}`.
export function infoKeysUsed() {
  const keys = new Set();
  const add = (c) => { if (c.info) keys.add(c.info); for (const k of c.infos ?? []) keys.add(k); };
  for (const s of SECTIONS) { add(s); s.controls.forEach(add); }
  ACTIONS.forEach(add);
  FIXED.forEach(add);
  return keys;
}

export function oldIdsCovered() {
  const ids = new Set(Object.keys(LAYOUT_ONLY));
  const add = (c) => { ids.add(c.id); for (const r of c.replaces ?? []) ids.add(r); };
  for (const s of SECTIONS) s.controls.forEach(add);
  ACTIONS.forEach((a) => (a.replaces ?? []).forEach((r) => ids.add(r)));
  FIXED.forEach(add);
  return ids;
}
