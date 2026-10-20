const string_width = require('string-width');
const segments = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const emoji_pattern = /\p{Emoji_Presentation}|\uFE0F|\u20E3/u;

function width(text) {
  let columns = 0;
  for (const { segment } of segments.segment(text)) {
    columns += emoji_pattern.test(segment)
      ? 2 : string_width(segment.replace(/[\p{Mark}\p{Default_Ignorable_Code_Point}]/gu, ''));
  }
  return columns;
}

function split_row(line) {
  const pipes = [];
  for (let index = 0; index < line.length; index++) {
    if (line[index] === '\\') {
      index++;
    } else if (line[index] === '`') {
      const run = /^`+/.exec(line.slice(index))[0];
      let closing = line.indexOf(run, index + run.length);
      while (closing >= 0 && (line[closing - 1] === '`' || line[closing + run.length] === '`')) {
        closing = line.indexOf(run, closing + run.length);
      }
      index = closing >= 0 ? closing + run.length - 1 : index + run.length - 1;
    } else if (line[index] === '|') {
      pipes.push(index);
    }
  }
  if (!pipes.length) return undefined;
  const boundaries = [-1, ...pipes, line.length];
  const cells = boundaries.slice(1).map((end, index) => {
    const start = boundaries[index] + 1;
    return { text: line.slice(start, end).trim(), start, end };
  });
  if (!cells[0].text) cells.shift();
  if (!cells[cells.length - 1]?.text) cells.pop();
  return cells.length ? cells : undefined;
}

function find_tables(text) {
  const lines = text.split(/\r\n|\n|\r/);
  const tables = [];
  for (let index = 0; index < lines.length - 1; index++) {
    const header = split_row(lines[index]);
    const separator = split_row(lines[index + 1]);
    if (!header || !separator || header.length !== separator.length) continue;
    if (!separator.every(cell => /^:?-{3,}:?$/.test(cell.text))) continue;
    const start = index;
    const rows = [header.map(cell => cell.text)];
    const indent = /^\s*/.exec(lines[index])[0];
    index++;
    while (index + 1 < lines.length) {
      const cells = split_row(lines[index + 1]);
      if (!cells || /^\s*/.exec(lines[index + 1])[0] !== indent) break;
      rows.push(cells.map(cell => cell.text));
      index++;
    }
    const columns = Math.max(...rows.map(row => row.length));
    const aligns = separator.map(cell => cell.text.endsWith(':') ? (cell.text.startsWith(':') ? 'center' : 'right') : 'left');
    while (aligns.length < columns) aligns.push('left');
    for (const row of rows) while (row.length < columns) row.push('');
    tables.push({ start, end: index, indent, rows, aligns, lines: lines.slice(start, index + 1) });
  }
  return tables;
}

const formula_pattern = /^\[[^\]]*\]\(#(sum|avg|min|max|count)\)$/i;
const formulas = {
  sum: numbers => numbers.reduce((total, number) => total + number, 0),
  avg: numbers => numbers.length ? formulas.sum(numbers) / numbers.length : undefined,
  min: numbers => numbers.length ? Math.min(...numbers) : undefined,
  max: numbers => numbers.length ? Math.max(...numbers) : undefined,
  count: numbers => numbers.length,
};

// `[6](#sum)` cells take the value over every other numeric body cell in their column.
function recalc(table) {
  const body = table.rows.slice(1);
  for (let column = 0; column < table.aligns.length; column++) {
    const values = body.map(row => row[column]).filter(cell => !formula_pattern.test(cell)).map(number_text).filter(Boolean);
    const numbers = values.map(parseFloat);
    const places = Math.max(2, ...values.map(text => text.split('.')[1]?.length ?? 0));
    for (const row of body) {
      const match = formula_pattern.exec(row[column]);
      if (!match) continue;
      const result = formulas[match[1].toLowerCase()](numbers);
      row[column] = `[${result === undefined ? '' : Number(result.toFixed(places))}](#${match[1]})`;
    }
  }
}

function format_table(table, eol = '\n') {
  recalc(table);
  const widths = table.aligns.map((align, column) => Math.max(align === 'center' ? 5 : align === 'right' ? 4 : 3, ...table.rows.map(row => width(row[column]))));
  const row_text = cells => table.indent + '| ' + cells.join(' | ') + ' |';
  const lines = table.rows.map(row => row_text(row.map((cell, column) => {
    const padding = widths[column] - width(cell);
    const before = table.aligns[column] === 'right' ? padding : table.aligns[column] === 'center' ? Math.floor(padding / 2) : 0;
    return ' '.repeat(before) + cell + ' '.repeat(padding - before);
  })));
  const separator = widths.map((size, column) => {
    const align = table.aligns[column];
    return (align === 'center' ? ':' : '-') + '-'.repeat(size - 2) + (align === 'left' ? '-' : ':');
  });
  lines.splice(1, 0, row_text(separator));
  return lines.join(eol);
}

function cell_at(table, line, character) {
  const cells = split_row(table.lines[line - table.start]);
  let column = cells.findIndex(cell => character <= cell.end);
  if (column < 0) column = cells.length - 1;
  return { row: Math.max(0, line - table.start - 1), column };
}

function cell_range(text, row, column) {
  const line = row === 0 ? 0 : row + 1;
  const cells = split_row(text.split(/\r\n|\n|\r/)[line]);
  const cell = cells[column];
  const raw = text.split(/\r\n|\n|\r/)[line].slice(cell.start, cell.end);
  const start = cell.start + (/^\s*/.exec(raw)[0].length);
  return { line, start: cell.text ? start : cell.start + 1, end: cell.text ? start + cell.text.length : cell.start + 1 };
}

function navigate(table, cell, direction) {
  const columns = table.aligns.length;
  const index = cell.row * columns + cell.column + direction;
  if (index < 0) return undefined;
  const row = Math.floor(index / columns);
  if (row === table.rows.length) table.rows.push(Array(columns).fill(''));
  return { row, column: index % columns };
}

function insert_column(table, column) {
  table.aligns.splice(column, 0, 'left');
  for (const row of table.rows) row.splice(column, 0, '');
}

function move_columns(table, first, last, direction) {
  if (first + direction < 0 || last + direction >= table.aligns.length) return false;
  for (const row of [table.aligns, ...table.rows]) {
    const cells = row.splice(first, last - first + 1);
    row.splice(first + direction, 0, ...cells);
  }
  return true;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

// Leading rating emoji, `~` and `$` are skipped so `🟢 1.13` reads as 1.13.
function number_text(cell) {
  const match = /^[^\p{L}\d-]*(-?\d[\d,]*(?:\.\d+)?)/u.exec(cell);
  return match ? match[1].replace(/,/g, '') : undefined;
}

// ISO dates sort as text, which orders them by year, month then day.
function sort_key(cell) {
  if (!cell || cell === '-') return { blank: true };
  if (/^\d{4}-\d{2}/.test(cell)) return { text: cell };
  const number = number_text(cell);
  return number ? { number: parseFloat(number) } : { text: cell };
}

// Blanks stay last in both directions, numbers come before text.
function compare_cells(a, b, direction) {
  const left = sort_key(a);
  const right = sort_key(b);
  if (left.blank || right.blank) return (left.blank ? 1 : 0) - (right.blank ? 1 : 0);
  const left_number = left.number !== undefined;
  const right_number = right.number !== undefined;
  if (left_number !== right_number) return left_number ? -direction : direction;
  return direction * (left_number ? left.number - right.number : collator.compare(left.text, right.text));
}

// Stable sort, so sorting B then A orders ties in A by B.
// Formula rows stay last.
function sort_rows(table, column, direction) {
  const [header, ...body] = table.rows;
  const is_formula_row = row => row.some(cell => formula_pattern.test(cell));
  const data = body.filter(row => !is_formula_row(row));
  data.sort((a, b) => compare_cells(a[column], b[column], direction));
  table.rows = [header, ...data, ...body.filter(is_formula_row)];
}

function from_delimited(text, delimiter) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  let closed = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') { cell += '"'; index++; }
        else { quoted = false; closed = true; }
      } else cell += character;
    } else if (character === '"' && !cell && !closed) {
      quoted = true;
    } else if (character === delimiter || character === '\n' || character === '\r') {
      row.push(cell);
      cell = '';
      closed = false;
      if (character !== delimiter) {
        rows.push(row);
        row = [];
        if (character === '\r' && text[index + 1] === '\n') index++;
      }
    } else if (closed) {
      if (character !== ' ' && character !== '\t') throw new Error('Unexpected text after a quoted cell.');
    } else if (character === '"') {
      throw new Error('A quoted cell must begin with a quote.');
    } else cell += character;
  }
  if (quoted) throw new Error('Unclosed quoted cell.');
  if (row.length || cell || closed || !rows.length) rows.push([...row, cell]);
  const columns = Math.max(...rows.map(cells => cells.length));
  for (const cells of rows) {
    while (cells.length < columns) cells.push('');
    for (let index = 0; index < cells.length; index++) {
      cells[index] = cells[index].trim().replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r\n|\n|\r/g, '<br>');
    }
  }
  return { rows, aligns: Array(columns).fill('left'), indent: '' };
}

module.exports = { width, split_row, find_tables, format_table, cell_at, cell_range, navigate, insert_column, move_columns, sort_rows, from_delimited };
