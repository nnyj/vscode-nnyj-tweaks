const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vscode = require('vscode');
const engine = require('../src/table_engine');

async function run() {
  await vscode.extensions.getExtension('nnyj.nnyj-tweaks').activate();
  const command = name => vscode.commands.executeCommand('nnyjTweaks.table.' + name);
  const table_text = '| Model | Cost |\n| --- | --- |\n| Sol | 🔴 5 |';
  const document = await vscode.workspace.openTextDocument({ content: table_text, language: 'markdown' });
  const editor = await vscode.window.showTextDocument(document);
  const select = (row, column) => {
    const range = engine.cell_range(document.getText(), row, column);
    editor.selection = new vscode.Selection(range.line, range.start, range.line, range.start);
  };
  const table = () => engine.find_tables(document.getText())[0];

  select(0, 1);
  await command('next_cell');
  assert.equal(editor.selection.start.line, 2);
  assert.equal(document.getText(editor.selection), 'Sol');
  await command('previous_cell');
  assert.equal(document.getText(editor.selection), 'Cost');
  select(1, 1);
  await command('next_cell');
  assert.equal(table().rows.length, 3);
  assert.equal(editor.selection.start.line, 3);
  assert.equal(editor.selection.isEmpty, true);
  await command('insert_left');
  assert.deepEqual(table().rows[1], ['', 'Sol', '🔴 5']);
  await command('insert_right');
  assert.deepEqual(table().rows[1], ['', '', 'Sol', '🔴 5']);
  select(1, 2);
  await command('move_left');
  assert.deepEqual(table().rows[1], ['', 'Sol', '', '🔴 5']);
  await command('move_right');
  assert.deepEqual(table().rows[1], ['', '', 'Sol', '🔴 5']);
  for (const align of ['center', 'right', 'left']) {
    await command('align_' + align);
    assert.equal(table().aligns[2], align);
  }

  const csv = await vscode.workspace.openTextDocument({ content: 'name,note\n"Doe, Jane","hello"', language: 'markdown' });
  const csv_editor = await vscode.window.showTextDocument(csv);
  csv_editor.selection = new vscode.Selection(csv.positionAt(0), csv.positionAt(csv.getText().length));
  await command('from_csv');
  assert.deepEqual(engine.find_tables(csv.getText())[0].rows, [['name', 'note'], ['Doe, Jane', 'hello']]);
  const tsv = await vscode.workspace.openTextDocument({ content: 'name\tnote\nA\tx|y', language: 'markdown' });
  const tsv_editor = await vscode.window.showTextDocument(tsv);
  tsv_editor.selection = new vscode.Selection(tsv.positionAt(0), tsv.positionAt(tsv.getText().length));
  await command('from_tsv');
  assert.deepEqual(engine.find_tables(tsv.getText())[0].rows, [['name', 'note'], ['A', 'x\\|y']]);

  const fenced_text = '~~~md\n' + table_text + '\n~~~\n\n' + table_text;
  const fenced = await vscode.workspace.openTextDocument({ content: fenced_text, language: 'markdown' });
  const fenced_editor = await vscode.window.showTextDocument(fenced);
  fenced_editor.selection = new vscode.Selection(1, 2, 1, 2);
  await command('next_cell');
  assert.equal(fenced.getText(), fenced_text);
  await command('format_all');
  assert.equal(fenced.getText().split('\n~~~')[0], fenced_text.split('\n~~~')[0]);
  assert.equal(engine.find_tables(fenced.getText()).length, 1);

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nnyj_table_save_'));
  const filename = path.join(directory, 'background.md');
  await fs.writeFile(filename, table_text);
  const background = await vscode.workspace.openTextDocument(filename);
  const edit = new vscode.WorkspaceEdit();
  edit.insert(background.uri, background.positionAt(background.getText().length), '\n');
  await vscode.workspace.applyEdit(edit);
  const config = vscode.workspace.getConfiguration('nnyjTweaks.table');
  await config.update('format_on_save', true, vscode.ConfigurationTarget.Global);
  const foreground_before = fenced.getText();
  assert.equal(await background.save(), true);
  assert.equal(await fs.readFile(filename, 'utf8'), engine.format_table(engine.find_tables(table_text)[0]) + '\n');
  assert.equal(fenced.getText(), foreground_before);
  await config.update('format_on_save', false, vscode.ConfigurationTarget.Global);

  await config.update('enabled', false, vscode.ConfigurationTarget.Global);
  assert.equal((await vscode.commands.getCommands()).includes('nnyjTweaks.table.next_cell'), false);
  await config.update('enabled', true, vscode.ConfigurationTarget.Global);
  assert.equal((await vscode.commands.getCommands()).includes('nnyjTweaks.table.next_cell'), true);
  await fs.unlink(filename);
  await fs.rmdir(directory);
  console.log('TABLE_EDITOR_TEST_PASS: all 12 commands, navigation selections, fences, background save and live toggle.');
}

module.exports = { run };
