/** A small RFC 4180 CSV reader (quotes, doubled quotes, commas and newlines inside quotes, a leading BOM). */
export function parseCsv(text: string): Array<Record<string, string>> {
  const rows: Array<Array<string>> = [];
  let row: Array<string> = [];
  let field = '';
  let quoted = false;
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // drop a byte-order mark
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && input[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((r) => r.some((cell) => cell !== ''));
  if (!header) return [];
  return body.map((cells) => Object.fromEntries(header.map((name, i) => [name, (cells[i] ?? '').trim()])));
}
