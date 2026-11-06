// Stand-in for the tank controller: the mockup's state, with nothing simulated. Its settings
// keys follow DEFAULT_SETTINGS in controller.js, so connecting it later is a swap, not a rewrite.
import { useCallback, useEffect, useMemo, useReducer } from 'react';
import { TOOLS, PALETTES, EXAMPLES, toolDef } from './controls.js';
import { FIXED, SECTIONS } from './features.js';

function startingValues() {
  const values = {};
  for (const [name, def] of Object.entries(TOOLS)) {
    values[name] = Object.fromEntries(def.params.map((p) => [p.key, p.value]));
    for (const c of def.choices) values[name][c.key] = c.value;
  }
  values.text.string = 'Marbled';
  return values;
}

const HISTORY = [
  'Palette: Copper & Verdigris', 'Drops ×24', 'Settle', 'Full rake 0°, 12 teeth', 'Full rake 180°, offset 5.8', 'Stir, 3 rings',
];

export function initialState(overrides = {}) {
  const { settings, ...rest } = overrides;
  return {
    view: 'simple',
    tool: 'drop',
    values: startingValues(),
    palette: 'Copper & Verdigris',
    ink: 0,
    settings: {
      ...Object.fromEntries([...SECTIONS.flatMap((x) => x.controls), ...FIXED].filter((c) => 'value' in c).map((c) => [c.id, c.value])),
      simulator: 'wake', visc: '1000', tankW: '1000', tankH: '700', useBath: true, bath: '#14211f', tileOffset: '', speed: '1',
      ...settings,
    },
    freezeMode: 'off',
    notice: null,
    playing: true,
    time: 12.4,
    shapes: 80,
    history: HISTORY,
    historyAt: HISTORY.length,
    drawer: false,
    script: EXAMPLES['Verdigris waves'],
    example: 'Verdigris waves',
    scriptError: null,
    creature: false,
    panel: 'palette',
    ...rest,
  };
}

function reducer(s, a) {
  switch (a.type) {
    case 'set': return { ...s, ...a.patch };
    case 'setting': return { ...s, settings: { ...s.settings, [a.key]: a.value } };
    case 'value': return { ...s, values: { ...s.values, [a.tool]: { ...s.values[a.tool], [a.key]: a.value } } };
    case 'tool': return { ...s, tool: a.tool };
    case 'undo': return { ...s, historyAt: Math.max(0, s.historyAt - 1) };
    case 'redo': return { ...s, historyAt: Math.min(s.history.length, s.historyAt + 1) };
    case 'act': {
      const history = [...s.history.slice(0, s.historyAt), a.label];
      return { ...s, history, historyAt: history.length, shapes: s.shapes + 6 };
    }
    case 'clear': return { ...s, history: [], historyAt: 0, shapes: 0, time: 0 };
    case 'tick': return s.playing ? { ...s, time: s.time + 0.1 * Number(s.settings.speed) } : s;
    case 'notice': return { ...s, notice: a.text };
    case 'example': return { ...s, example: a.name, script: EXAMPLES[a.name] ?? '', scriptError: null };
    case 'run': {
      if (/\bthrow\b|\)\s*\(/.test(s.script) || s.script.includes('oops')) {
        return { ...s, scriptError: 'Line 3: oops is not defined' };
      }
      return { ...s, scriptError: null, history: [`Script: ${s.example || 'untitled'}`], historyAt: 1, time: 0, shapes: 120 };
    }
    default: throw new Error(`Unknown action ${a.type}`);
  }
}

export function useMockTank(overrides) {
  const [state, dispatch] = useReducer(reducer, overrides, initialState);
  useEffect(() => {
    const id = setInterval(() => dispatch({ type: 'tick' }), 100);
    return () => clearInterval(id);
  }, []);
  const palette = useMemo(() => PALETTES.find((p) => p.name === state.palette) ?? PALETTES[0], [state.palette]);
  const act = useCallback((label) => dispatch({ type: 'act', label }), []);
  const applyTool = useCallback(() => act(`${toolDef(state.tool).label}`), [act, state.tool]);
  return { state, dispatch, palette, act, applyTool };
}
