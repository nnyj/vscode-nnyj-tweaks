const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../src/table_engine');

const sample = '| Model | Cost |\n| --- | --- |\n| Sol | 🔴 5 |\n| Luna | 🟢 0.2 |';
const parse = text => engine.find_tables(text)[0];

test('Unicode widths use graphemes, including flags, joiners and combining marks', () => {
  for (const text of ['🔴', '🟢', '🖼️', '👩‍💻', '🇸🇬', '👍🏽', '1️⃣', '🫩', '中']) assert.equal(engine.width(text), 2, text);
  for (const text of ['A', 'é', 'א', '©']) assert.equal(engine.width(text), 1, text);
  assert.equal(engine.width('\u200D'), 0);
});

test('padding aligns columns and formatting is idempotent', () => {
  const formatted = engine.format_table(parse(sample));
  const rows = formatted.split('\n').map(line => engine.split_row(line).map(cell => engine.width(line.slice(cell.start, cell.end))));
  rows.forEach(row => assert.deepEqual(row, rows[0]));
  assert.equal(engine.format_table(parse(formatted)), formatted);
});

test('alignment remains parseable for short and empty cells', () => {
  const table = parse('| a | b | c |\n| --- | --- | --- |\n| x | | z |');
  table.aligns = ['left', 'center', 'right'];
  const formatted = engine.format_table(table);
  assert.deepEqual(parse(formatted).aligns, table.aligns);
  assert.equal(engine.format_table(parse(formatted)), formatted);
});

test('escaped pipes, code spans, and repeated backticks stay in their cells', () => {
  const cells = engine.split_row('| a\\|b | `c|d` | ``e`|f`` | x\\\\ |');
  assert.deepEqual(cells.map(cell => cell.text), ['a\\|b', '`c|d`', '``e`|f``', 'x\\\\']);
  assert.deepEqual(engine.split_row('| `unclosed | next |').map(cell => cell.text), ['`unclosed', 'next']);
});

test('tables require a matching delimiter row', () => {
  for (const text of ['| prose |', '| a | b |\n| --- |', '| a |\n| prose |']) assert.deepEqual(engine.find_tables(text), []);
  assert.equal(engine.find_tables('a | b\n--- | ---\nc | d').length, 1);
});

test('tables inside backtick and tilde fences are found', () => {
  for (const fence of ['```', '~~~', '````']) {
    const text = fence + 'md\n' + sample + '\n```js\n' + sample + '\n' + fence + '\n\n' + sample;
    assert.equal(engine.find_tables(text).length, 3, fence);
  }
});

test('indentation, CRLF, missing cells and extra cells survive formatting', () => {
  const text = '  | a | b |\r\n  | --- | --- |\r\n  | x |\r\n  | y | z | extra |';
  const table = parse(text);
  assert.deepEqual(table.rows, [['a', 'b', ''], ['x', '', ''], ['y', 'z', 'extra']]);
  const formatted = engine.format_table(table, '\r\n');
  assert.ok(formatted.split('\r\n').every(line => line.startsWith('  |')));
  assert.deepEqual(parse(formatted).rows, table.rows);
});

test('multiple tables are scanned separately', () => {
  const tables = engine.find_tables(sample + '\n\nText\n\n' + sample);
  assert.deepEqual(tables.map(table => [table.start, table.end]), [[0, 3], [7, 10]]);
});

test('Tab skips delimiter row, wraps and appends one row', () => {
  const table = parse(sample);
  assert.deepEqual(engine.navigate(table, { row: 0, column: 1 }, 1), { row: 1, column: 0 });
  assert.deepEqual(engine.navigate(table, { row: 2, column: 1 }, 1), { row: 3, column: 0 });
  assert.deepEqual(table.rows.at(-1), ['', '']);
  assert.deepEqual(engine.navigate(table, { row: 1, column: 0 }, -1), { row: 0, column: 1 });
  assert.equal(engine.navigate(table, { row: 0, column: 0 }, -1), undefined);
});

test('header-only tables add a body row when navigating past header', () => {
  const table = parse('| a |\n| --- |');
  assert.deepEqual(engine.navigate(table, { row: 0, column: 0 }, 1), { row: 1, column: 0 });
  assert.deepEqual(parse(engine.format_table(table)).rows, [['a'], ['']]);
});

test('cursor ranges use UTF-16 offsets and select the right cell after padding', () => {
  const formatted = engine.format_table(parse(sample));
  const table = parse(formatted);
  const range = engine.cell_range(formatted, 1, 1);
  assert.equal(formatted.split('\n')[range.line].slice(range.start, range.end), '🔴 5');
  assert.deepEqual(engine.cell_at(table, range.line, range.start), { row: 1, column: 1 });
  const indented = parse('  ' + formatted.replace(/\n/g, '\n  '));
  assert.deepEqual(engine.cell_at(indented, range.line, range.start + 2), { row: 1, column: 1 });
});

test('inserting at either edge preserves all rows and alignment', () => {
  const table = parse(sample);
  engine.insert_column(table, 0);
  engine.insert_column(table, 3);
  assert.deepEqual(table.rows[1], ['', 'Sol', '🔴 5', '']);
  assert.deepEqual(parse(engine.format_table(table)).rows, table.rows);
});

test('moving a selection moves every row and its alignments together', () => {
  const table = parse('| a | b | c | d |\n| --- | ---: | :---: | --- |\n| 1 | 2 | 3 | 4 |');
  assert.equal(engine.move_columns(table, 1, 2, -1), true);
  assert.deepEqual(table.rows, [['b', 'c', 'a', 'd'], ['2', '3', '1', '4']]);
  assert.deepEqual(table.aligns, ['right', 'center', 'left', 'left']);
  assert.equal(engine.move_columns(table, 0, 1, -1), false);
  assert.equal(engine.move_columns(table, 0, 1, 1), true);
  assert.deepEqual(table.rows[0], ['a', 'b', 'c', 'd']);
});

test('CSV handles quoted commas, escaped quotes, CRLF and multiline values', () => {
  const table = engine.from_delimited('name,note\r\n"Doe, Jane","said ""hi""\r\nnext"\r\n', ',');
  assert.deepEqual(table.rows, [['name', 'note'], ['Doe, Jane', 'said "hi"<br>next']]);
  assert.deepEqual(parse(engine.format_table(table)).rows, table.rows);
});

test('TSV escapes Markdown pipes and backslashes and keeps extra columns', () => {
  const table = engine.from_delimited('name\tnote\nA\ta|b\textra\nB\tc\\d', '\t');
  assert.deepEqual(table.rows, [['name', 'note', ''], ['A', 'a\\|b', 'extra'], ['B', 'c\\\\d', '']]);
  assert.deepEqual(parse(engine.format_table(table)).rows, table.rows);
});

test('malformed quoted input is rejected before a document edit', () => {
  for (const text of ['a,b\n"missing', 'a,b\n"closed"wrong,x', 'a,b\npar"tial,x']) assert.throws(() => engine.from_delimited(text, ','));
});

test('CSV retains trailing empty cells and a quoted empty final row', () => {
  assert.deepEqual(engine.from_delimited('a,b\nx,', ',').rows, [['a', 'b'], ['x', '']]);
  assert.deepEqual(engine.from_delimited('a\n""', ',').rows, [['a'], ['']]);
});

test('long cells are not truncated at an arbitrary cursor column', () => {
  const text = 'x'.repeat(12000);
  const table = parse('| a |\n| --- |\n| ' + text + ' |');
  assert.equal(parse(engine.format_table(table)).rows[1][0], text);
});
