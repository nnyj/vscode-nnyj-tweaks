const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

// Overrides format matches scripts/ai/policy/policy.js: {"group:<name>": "<ISO until>", "cmd:<rule>": ...}.
// Active override = until in the future; guards auto-allow matching ask commands while active.

const UNIT_MS = { m: 60e3, h: 3600e3, d: 86400e3 };
const REFRESH_MS = 30e3;

let statusItem;
let watcher;
let ticker;

function start() {
  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 0);
  statusItem.command = 'nnyjTweaks.policy.pick';
  statusItem.show();

  const subs = [
    statusItem,
    vscode.commands.registerCommand('nnyjTweaks.policy.pick', pickGroup),
    vscode.commands.registerCommand('nnyjTweaks.policy.clear', clearAll),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('nnyjTweaks.policyToggle')) {
        watchOverrides();
        render();
      }
    }),
  ];

  watchOverrides();
  ticker = setInterval(render, REFRESH_MS);
  render();

  return {
    dispose() {
      subs.forEach(s => s.dispose());
      if (watcher) watcher.close();
      watcher = undefined;
      if (ticker) clearInterval(ticker);
      ticker = undefined;
    },
  };
}

// --- config ---

function cfg(key, fallback) {
  return vscode.workspace.getConfiguration('nnyjTweaks.policyToggle').get(key, fallback);
}

const overridesPath = () => cfg('overridesPath', '');
const policyPath = () => cfg('policyPath', '');
const durations = () => cfg('durations', []);

// --- io ---

function askGroups() {
  try {
    const policy = JSON.parse(fs.readFileSync(policyPath(), 'utf8'));
    return Object.entries(policy.command_groups || {})
      .filter(([, spec]) => spec.decision === 'ask')
      .map(([name]) => name);
  } catch {
    return [];
  }
}

function readOverrides() {
  const active = {};
  try {
    const raw = JSON.parse(fs.readFileSync(overridesPath(), 'utf8'));
    for (const [key, value] of Object.entries(raw)) {
      const until = Date.parse(String(value));
      if (Number.isFinite(until) && until > Date.now()) active[key] = until;
    }
  } catch { }
  return active;
}

function writeOverrides(overrides) {
  const file = overridesPath();
  try {
    const out = {};
    for (const [key, until] of Object.entries(overrides)) out[key] = new Date(until).toISOString();
    if (!Object.keys(out).length) {
      fs.rmSync(file, { force: true });
    } else {
      const tmp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, `${JSON.stringify(out, null, 2)}\n`);
      fs.renameSync(tmp, file);
    }
  } catch (err) {
    vscode.window.showErrorMessage(`Policy Toggle: cannot write ${file} - ${err}`);
    return;
  }
  render();
}

function clearAll() {
  writeOverrides({});
}

// --- ui ---

function parseMs(text) {
  const m = /^(\d+)([mhd])$/.exec(text.trim());
  return m ? Number(m[1]) * UNIT_MS[m[2]] : undefined;
}

function formatRemaining(ms) {
  const minutes = Math.round(ms / 60e3);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest ? `${hours}h${rest}m` : `${hours}h`;
  return `${Math.floor(hours / 24)}d${hours % 24}h`;
}

async function pickGroup() {
  const overrides = readOverrides();
  const globalUntil = overrides['group:*'];
  const items = [
    {
      label: globalUntil ? '$(unlock) all groups' : '$(globe) all groups',
      description: globalUntil ? `allowed, ${formatRemaining(globalUntil - Date.now())} left` : 'override every ask group at once',
      value: '*',
    },
    ...askGroups().map(name => {
      const until = overrides[`group:${name}`];
      return {
        label: until ? `$(unlock) ${name}` : `$(lock) ${name}`,
        description: until ? `allowed, ${formatRemaining(until - Date.now())} left` : 'ask',
        value: name,
      };
    }),
    ...(Object.keys(overrides).length ? [{ label: '$(circle-slash) Clear all overrides', description: '', value: '' }] : []),
  ];
  if (!items.length) {
    vscode.window.showWarningMessage(`Policy Toggle: no ask groups found in ${policyPath()}`);
    return;
  }

  const choice = await vscode.window.showQuickPick(items, { placeHolder: 'Toggle group override' });
  if (!choice) return;
  if (!choice.value) {
    clearAll();
    return;
  }

  const key = `group:${choice.value}`;
  const durationItems = [
    ...(overrides[key] ? [{ label: '$(circle-slash) Off, back to ask', value: 'off' }] : []),
    ...durations().map(d => ({ label: `$(clock) allow ${d}`, value: d })),
    { label: '$(edit) Custom...', value: 'custom' },
  ];
  const duration = await vscode.window.showQuickPick(durationItems, { placeHolder: `${choice.value === '*' ? 'all groups' : choice.value}: allow for how long?` });
  if (!duration) return;

  if (duration.value === 'off') {
    delete overrides[key];
    writeOverrides(overrides);
    return;
  }

  let text = duration.value;
  if (text === 'custom') {
    const entry = await vscode.window.showInputBox({
      prompt: 'Allow duration',
      placeHolder: '90m, 6h, 2d',
      validateInput: v => (parseMs(v) ? undefined : 'Use a number followed by m, h, or d'),
    });
    if (!entry) return;
    text = entry;
  }

  const ms = parseMs(text);
  if (!ms) return;
  overrides[key] = Date.now() + ms;
  writeOverrides(overrides);
}

function render() {
  const overrides = readOverrides();
  const groups = Object.keys(overrides)
    .filter(key => key.startsWith('group:'))
    .map(key => key === 'group:*' ? 'all' : key.slice('group:'.length));
  const cmds = Object.keys(overrides).filter(key => key.startsWith('cmd:')).length;

  if (!groups.length && !cmds) {
    statusItem.text = '$(lock) policy';
    statusItem.tooltip = 'All ask groups gated\nClick to allow a group temporarily';
    return;
  }

  const soonest = Math.min(...Object.values(overrides));
  const parts = [...groups, ...(cmds ? [`${cmds} cmd`] : [])];
  statusItem.text = `$(unlock) ${parts.join(', ')} ${formatRemaining(soonest - Date.now())}`;
  statusItem.tooltip = `Active overrides:\n${Object.entries(overrides)
    .map(([key, until]) => `${key} until ${new Date(until).toLocaleString()}`)
    .join('\n')}\nClick to change`;
}

// --- overrides watching ---
// Watch the directory, not the file: guards delete and recreate overrides.json,
// which breaks a file-level watch after the first rewrite.

function watchOverrides() {
  if (watcher) watcher.close();
  watcher = undefined;

  const file = overridesPath();
  if (!file) return;

  try {
    const name = path.basename(file);
    watcher = fs.watch(path.dirname(file), (_event, changed) => {
      if (!changed || changed === name) render();
    });
  } catch {
    // directory missing or unwatchable: the interval refresh still keeps the label honest
  }
}

module.exports = { start };
