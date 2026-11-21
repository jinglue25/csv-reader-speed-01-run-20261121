// Delimiter positions are cached across fields: each indexOf stream moves only forward.
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const rows = [], errors = [];
  let columns = null, width = -1;
  let pos = text.charCodeAt(0) === 65279 ? 1 : 0;
  let line = 1;
  let comma = -1, lf = -1, cr = -1;

  while (pos < n) {
    let c = text.charCodeAt(pos);
    if (c === 10) { pos++; line++; continue; }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2; line++; continue;
    }
    const recordLine = line;
    const recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let more = true, quoted = false;
    while (more) {
      quoted = text.charCodeAt(pos) === 34;
      let value = '', junk = false;
      if (quoted) {
        const open = pos;
        let start = pos + 1;
        let q = text.indexOf('"', start);
        while (q >= 0 && text.charCodeAt(q + 1) === 34) {
          value += text.slice(start, q + 1);
          start = q + 2;
          q = text.indexOf('"', start);
        }
        if (q < 0) {
          errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
          value = '"';
          pos = open + 1;
        } else {
          value += text.slice(start, q);
          // Most quoted fields also have no line breaks; normalization is cold.
          if (/[\r\n]/.test(value)) {
            let normalized = '', start = 0;
            for (let i = 0; i < value.length; i++) {
              const ch = value.charCodeAt(i);
              if (ch === 13) {
                normalized += value.slice(start, i) + '\n';
                if (value.charCodeAt(i + 1) === 10) i++;
                start = i + 1;
                line++;
              } else if (ch === 10) line++;
            }
            value = normalized + value.slice(start);
          }
          pos = q + 1;
          junk = true;
        }
      }
      // Read the unquoted field or the suffix of a closed quote in whole slices.
      const before = value.length;
      let start = pos;
      for (;;) {
        if (comma < pos) { comma = text.indexOf(',', pos); if (comma < 0) comma = n; }
        if (lf < pos) { lf = text.indexOf('\n', pos); if (lf < 0) lf = n; }
        if (cr < pos) { cr = text.indexOf('\r', pos); if (cr < 0) cr = n; }
        const end = Math.min(comma, lf, cr);
        value += text.slice(start, end);
        pos = end;
        if (end === n) { more = false; break; }
        if (end === comma) { pos++; more = true; break; }
        if (end === lf) { pos++; line++; more = false; break; }
        if (text.charCodeAt(pos + 1) === 10) {
          pos += 2; line++; more = false; break;
        }
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        pos++;
        start = pos;
      }
      if (junk && value.length > before) {
        errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
      }
      fields.push(value);
    }
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;
    if (width < 0) width = fields.length;
    if (header && columns === null) { columns = fields; continue; }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
