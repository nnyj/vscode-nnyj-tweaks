const vscode = require('vscode');
const engine = require('./table_engine');
const languages = new Set(['markdown', 'mdx', 'quarto']);

function start() {
  const cache = new WeakMap();
  const busy = new WeakSet();
  let disposed = false;
  function tables_for(document) {
    if (!languages.has(document.languageId)) return [];
    const cached = cache.get(document);
    if (cached?.version === document.version) return cached.tables;
    const tables = engine.find_tables(document.getText());
    cache.set(document, { version: document.version, tables });
    return tables;
  }
  function table_for(editor) {
    if (!editor || editor.selections.length !== 1) return undefined;
    return tables_for(editor.document).find(table => editor.selection.start.line >= table.start && editor.selection.end.line <= table.end);
  }
  function update_context() {
    return vscode.commands.executeCommand('setContext', 'nnyjTweaks.table.in_table', !disposed && !!table_for(vscode.window.activeTextEditor));
  }
  function table_range(document, table) {
    return new vscode.Range(table.start, 0, table.end, document.lineAt(table.end).text.length);
  }
  function document_eol(document) {
    return document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
  }
  function select_cell(editor, table, text, cell) {
    const range = engine.cell_range(text, cell.row, cell.column);
    const start = new vscode.Position(table.start + range.line, range.start);
    const end = new vscode.Position(table.start + range.line, range.end);
    editor.selection = new vscode.Selection(end, start);
    editor.revealRange(editor.selection);
  }
  async function table_command(action, argument) {
    const editor = vscode.window.activeTextEditor;
    const source = table_for(editor);
    if (!source || busy.has(editor.document)) return;
    const table = { ...source, rows: source.rows.map(row => [...row]), aligns: [...source.aligns] };
    const first = engine.cell_at(table, editor.selection.start.line, editor.selection.start.character);
    const last = engine.cell_at(table, editor.selection.end.line, editor.selection.end.character);
    let cell = engine.cell_at(table, editor.selection.active.line, editor.selection.active.character);
    if (action === 'navigate') {
      cell = engine.navigate(table, cell, argument);
      if (!cell) return;
    } else if (action === 'insert') {
      cell.column += argument;
      engine.insert_column(table, cell.column);
    } else if (action === 'move') {
      if (editor.selection.start.line !== editor.selection.end.line) return;
      if (!engine.move_columns(table, first.column, last.column, argument)) return;
      cell.column += argument;
    } else if (action === 'align') {
      for (let row = first.row; row <= last.row; row++) {
        const start = row === first.row ? first.column : 0;
        const end = row === last.row ? last.column : table.aligns.length - 1;
        for (let column = start; column <= end; column++) table.aligns[column] = argument;
      }
    }
    const text = engine.format_table(table, document_eol(editor.document));
    const range = table_range(editor.document, source);
    busy.add(editor.document);
    try {
      if (text !== editor.document.getText(range)) {
        if (!await editor.edit(edit => edit.replace(range, text))) return;
        if (disposed || vscode.window.activeTextEditor !== editor) return;
      }
      select_cell(editor, table, text, cell);
    } finally {
      busy.delete(editor.document);
      update_context();
    }
  }
  function format_edits(document) {
    return tables_for(document).flatMap(table => {
      const range = table_range(document, table);
      const text = engine.format_table(table, document_eol(document));
      return text === document.getText(range) ? [] : [vscode.TextEdit.replace(range, text)];
    });
  }
  async function format_all() {
    const editor = vscode.window.activeTextEditor;
    if (!editor || busy.has(editor.document)) return;
    const edits = format_edits(editor.document);
    if (!edits.length) return;
    busy.add(editor.document);
    try {
      await editor.edit(edit => edits.forEach(change => edit.replace(change.range, change.newText)));
    } finally {
      busy.delete(editor.document);
      update_context();
    }
  }
  async function convert(delimiter) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selections.length !== 1 || editor.selection.isEmpty || busy.has(editor.document)) return;
    let table;
    try {
      table = engine.from_delimited(editor.document.getText(editor.selection), delimiter);
    } catch (error) {
      vscode.window.showErrorMessage('Table conversion: ' + error.message);
      return;
    }
    const selection = editor.selection;
    const text = engine.format_table(table, document_eol(editor.document));
    await editor.edit(edit => edit.replace(selection, text));
  }
  const commands = {
    next_cell: () => table_command('navigate', 1),
    previous_cell: () => table_command('navigate', -1),
    insert_left: () => table_command('insert', 0),
    insert_right: () => table_command('insert', 1),
    move_left: () => table_command('move', -1),
    move_right: () => table_command('move', 1),
    align_left: () => table_command('align', 'left'),
    align_center: () => table_command('align', 'center'),
    align_right: () => table_command('align', 'right'),
    format_all,
    from_csv: () => convert(','),
    from_tsv: () => convert('\t'),
  };
  const subscriptions = Object.entries(commands).map(([name, handler]) => vscode.commands.registerCommand('nnyjTweaks.table.' + name, handler));
  subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(update_context),
    vscode.window.onDidChangeTextEditorSelection(update_context),
    vscode.workspace.onDidChangeTextDocument(event => {
      if (event.document === vscode.window.activeTextEditor?.document) update_context();
    }),
    vscode.workspace.onWillSaveTextDocument(event => {
      const enabled = vscode.workspace.getConfiguration('nnyjTweaks.table', event.document).get('format_on_save', false);
      if (enabled && !busy.has(event.document)) event.waitUntil(Promise.resolve(format_edits(event.document)));
    }),
  );
  update_context();
  return {
    dispose() {
      disposed = true;
      subscriptions.forEach(subscription => subscription.dispose());
      update_context();
    },
  };
}

module.exports = { start };
