const vscode = require('vscode');

// In-session only: highlights die with the window. Upgrade path: persist to workspaceState keyed by uri.
let decoration;
let lines = new Map(); // uri string -> Set of line numbers

function apply(editor) {
  const set = lines.get(editor.document.uri.toString());
  const ranges = [...(set || [])].map(l => editor.document.lineAt(Math.min(l, editor.document.lineCount - 1)).range);
  editor.setDecorations(decoration, ranges);
}

function applyAll() {
  vscode.window.visibleTextEditors.forEach(apply);
}

function toggle() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const key = editor.document.uri.toString();
  if (!lines.has(key)) lines.set(key, new Set());
  const set = lines.get(key);
  for (const sel of editor.selections) {
    for (let l = sel.start.line; l <= sel.end.line; l++) set.has(l) ? set.delete(l) : set.add(l);
  }
  apply(editor);
}

function clearAll() {
  lines = new Map();
  applyAll();
}

function shift(e) {
  const set = lines.get(e.document.uri.toString());
  if (!set || !set.size) return;
  for (const change of e.contentChanges) {
    const start = change.range.start.line;
    const delta = (change.text.match(/\n/g) || []).length - (change.range.end.line - start);
    if (!delta) continue;
    const moved = new Set();
    for (const l of set) moved.add(l > start ? Math.max(start, l + delta) : l);
    set.clear();
    moved.forEach(l => set.add(l));
  }
  vscode.window.visibleTextEditors.filter(ed => ed.document === e.document).forEach(apply);
}

function makeDecoration() {
  if (decoration) decoration.dispose();
  const color = vscode.workspace.getConfiguration('nnyjTweaks.lineHighlight').get('color', '#ffe60030');
  decoration = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: color,
    overviewRulerColor: color,
    overviewRulerLane: vscode.OverviewRulerLane.Center,
  });
}

function start() {
  makeDecoration();
  const subs = [
    vscode.commands.registerCommand('nnyjTweaks.lineHighlight.toggle', toggle),
    vscode.commands.registerCommand('nnyjTweaks.lineHighlight.clearAll', clearAll),
    vscode.workspace.onDidChangeTextDocument(shift),
    vscode.workspace.onDidCloseTextDocument(doc => lines.delete(doc.uri.toString())),
    vscode.window.onDidChangeVisibleTextEditors(applyAll),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('nnyjTweaks.lineHighlight.color')) {
        makeDecoration();
        applyAll();
      }
    }),
  ];
  applyAll();
  return {
    dispose() {
      subs.forEach(s => s.dispose());
      decoration.dispose();
      decoration = undefined;
      lines = new Map();
    },
  };
}

module.exports = { start };
