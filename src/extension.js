const vscode = require('vscode');
const policy_toggle = require('./policy_toggle');
const open_left = require('./open_left');
const line_highlight = require('./line_highlight');
const close_empty = require('./close_empty');

const FEATURES = { policyToggle: policy_toggle, openLeft: open_left, lineHighlight: line_highlight, closeEmpty: close_empty };
const active = {};

function sync(ctx) {
  const cfg = vscode.workspace.getConfiguration('nnyjTweaks');
  for (const [name, feature] of Object.entries(FEATURES)) {
    const want = cfg.get(`${name}.enabled`, true);
    if (want && !active[name]) active[name] = feature.start(ctx);
    if (!want && active[name]) {
      active[name].dispose();
      delete active[name];
    }
  }
}

function activate(ctx) {
  sync(ctx);
  ctx.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('nnyjTweaks')) sync(ctx);
    }),
    { dispose: () => Object.values(active).forEach(f => f.dispose()) }
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
