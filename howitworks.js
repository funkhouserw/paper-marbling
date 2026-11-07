// Fills in the parts of how-it-works.html that come straight from the app's own catalogues, so they
// can't fall out of date. The simulator notes live in modelnotes.js, which the drop's FAQ reads too.
import { COMMANDS, VALUES } from './api.js';
import { TOOLS } from './tools.js';
import { INFO } from './info.js';
import { MODELS } from './models.js';
import { PALETTES } from './palettes.js';
import { MODEL_NOTES } from './modelnotes.js';

export { MODEL_NOTES };

const el = (tag, props = {}, ...kids) => {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...kids);
  return node;
};
const toolName = (name, def) => def.label ?? name[0].toUpperCase() + name.slice(1);

function renderModels() {
  for (const model of MODELS) {
    const notes = MODEL_NOTES[model.id];
    $('modelList').append(el('article', { id: `model-${model.id}`, className: 'model' },
      el('h3', { textContent: model.label }),
      el('p', { className: 'summary', textContent: model.title }),
      el('p', {}, el('strong', { textContent: 'How it works: ' }), notes.how),
      el('p', {}, el('strong', { textContent: 'Good for: ' }), notes.good),
      el('p', {}, el('strong', { textContent: 'Watch out for: ' }), notes.limit)));
  }
}

function renderTools() {
  for (const [name, def] of Object.entries(TOOLS)) {
    const article = el('article', {}, el('h3', { textContent: toolName(name, def) }), el('p', { textContent: INFO[`tool.${name}`] ?? '' }));
    const controls = Object.entries(def.params).map(([key, [label]]) => [label, INFO[`${name}.${key}`]]);
    if (controls.length) {
      const list = el('dl');
      for (const [label, text] of controls) list.append(el('dt', { textContent: label }), el('dd', { textContent: text ?? '' }));
      article.append(el('details', {}, el('summary', { textContent: `${controls.length} setting${controls.length === 1 ? '' : 's'}` }), list));
    }
    $('toolList').append(article);
  }
}

const shown = (value) => (value === null || value === undefined ? '' : JSON.stringify(value));

function renderCommands() {
  for (const group of [...new Set(COMMANDS.map((c) => c.group))]) {
    $('commandList').append(el('h3', { textContent: group }));
    for (const command of COMMANDS.filter((c) => c.group === group)) {
      const params = command.params ?? [];
      const signature = command.positional ? `${command.name}(${command.positional})` : `${command.name}(${params.length ? '{ … }' : ''})`;
      const box = el('details', { id: `command-${command.name}`, className: 'command' },
        el('summary', {}, el('code', { textContent: signature }), ` ${command.summary}`));
      if (params.length) {
        const rows = params.map(([param, type, value, description]) => el('tr', {},
          el('td', {}, el('code', { textContent: param })), el('td', { textContent: type }),
          el('td', {}, el('code', { textContent: shown(value) })), el('td', { textContent: description })));
        box.append(el('table', {},
          el('thead', {}, el('tr', {}, ...['Option', 'Type', 'Default', 'Meaning'].map((t) => el('th', { textContent: t })))),
          el('tbody', {}, ...rows)));
      }
      if (command.returns) box.append(el('p', {}, 'Returns ', el('code', { textContent: command.returns })));
      $('commandList').append(box);
    }
  }
  for (const value of VALUES) $('valueList').append(el('p', {}, el('code', { textContent: value.name }), `: ${value.summary}`));
  $('paletteList').textContent = PALETTES.map((p) => p.name).join(', ');
}

const $ = (id) => document.getElementById(id);
if (typeof document !== 'undefined') {
  renderModels();
  renderTools();
  renderCommands();
  // The lists above arrive after the page loads, so a link into them needs a second look.
  if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
}
