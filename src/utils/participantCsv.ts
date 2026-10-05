import type { Participant } from '../services/api';

export type ParticipantImportRow = Pick<Participant, 'first_name' | 'last_name' | 'gender' | 'hands' | 'club' | 'average' | 'email'> & {
  id?: number;
  division?: string;
};

export const parseParticipantCsv = (text: string): ParticipantImportRow[] => {
  const source = text.replace(/^\uFEFF/, '');
  const firstLine = source.split(/\r\n|\n|\r/, 1)[0] || '';
  const countDelimiters = (delimiter: string) => {
    let count = 0;
    let quoted = false;
    for (let index = 0; index < firstLine.length; index += 1) {
      const char = firstLine[index];
      if (char === '"' && quoted && firstLine[index + 1] === '"') {
        index += 1;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === delimiter && !quoted) {
        count += 1;
      }
    }
    return count;
  };
  const delimiter = [',', ';', '\t']
    .map((value) => ({ value, count: countDelimiters(value) }))
    .sort((left, right) => right.count - left.count)[0].value;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"' && quoted && source[index + 1] === '"') {
      field += '"';
      index += 1;
    } else if (char === '"' && (quoted || field.length === 0)) {
      quoted = !quoted;
    } else if (!quoted && char === delimiter) {
      row.push(field.trim());
      field = '';
    } else if (!quoted && (char === '\n' || char === '\r')) {
      row.push(field.trim());
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      field = '';
      if (char === '\r' && source[index + 1] === '\n') index += 1;
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error('The CSV contains an unclosed quoted field.');
  row.push(field.trim());
  if (row.some((value) => value !== '')) rows.push(row);
  if (rows.length === 0) return [];

  const normalizeHeader = (value: string) => value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
  const headers = rows[0].map(normalizeHeader);
  const findHeader = (...names: string[]) => headers.findIndex((header) => names.includes(header));
  const firstNameColumn = findHeader('first name', 'firstname', 'given name', 'givenname');
  const lastNameColumn = findHeader('last name', 'lastname', 'family name', 'surname');
  const hasHeader = firstNameColumn >= 0 || lastNameColumn >= 0 || findHeader('name', 'participant name') >= 0;
  const findColumn = (names: string[], fallback: number) => {
    const index = headers.findIndex((header) => names.includes(header));
    return hasHeader ? index : fallback;
  };
  const participantIdColumn = findColumn(['participant id', 'id'], -1);
  const firstColumn = findColumn(['first name', 'firstname', 'given name', 'givenname', 'name', 'participant name'], 0);
  const lastColumn = findColumn(['last name', 'lastname', 'family name', 'surname'], 1);
  const genderColumn = findColumn(['gender', 'sex'], 2);
  const handsColumn = findColumn(['hands', 'hand', 'handedness', 'style'], -1);
  const clubColumn = findColumn(['club', 'team', 'organization'], 3);
  const averageColumn = findColumn(['average', 'avg'], 4);
  const emailColumn = findColumn(['contact details', 'contact', 'email', 'e mail'], 5);
  const divisionColumn = findColumn(['division'], -1);
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const cell = (values: string[], column: number) => column >= 0 ? (values[column] || '').trim() : '';

  return dataRows.flatMap((values, index) => {
    const idText = cell(values, participantIdColumn);
    const parsedId = idText ? Number(idText) : undefined;
    if (idText && (!Number.isSafeInteger(parsedId) || (parsedId !== undefined && parsedId <= 0))) {
      throw new Error(`Invalid Participant ID on CSV row ${index + (hasHeader ? 2 : 1)}.`);
    }
    let first_name = cell(values, firstColumn);
    let last_name = cell(values, lastColumn);
    if (first_name && !last_name) {
      const parts = first_name.split(/\s+/).filter(Boolean);
      if (parts.length > 1) {
        first_name = parts[0];
        last_name = parts.slice(1).join(' ');
      } else {
        last_name = 'Player';
      }
    }
    if (!first_name && last_name) first_name = 'Unknown';
    if (!first_name && !last_name) return [];

    const rawAverage = cell(values, averageColumn);
    const parsedAverage = Number.parseInt(rawAverage, 10);
    const handsValue = cell(values, handsColumn).toLowerCase();
    return [{
      ...(parsedId ? { id: parsedId } : {}),
      first_name,
      last_name,
      gender: cell(values, genderColumn),
      hands: handsValue.startsWith('2') ? '2H' : '1H',
      club: cell(values, clubColumn),
      average: Number.isFinite(parsedAverage) ? parsedAverage : 0,
      email: cell(values, emailColumn),
      ...(divisionColumn >= 0 && cell(values, divisionColumn) ? { division: cell(values, divisionColumn) } : {}),
    }];
  });
};

export const parseCsvRows = (input: string): string[][] => {
  const text = input.replace(/^\uFEFF/, '');
  const firstLine = text.split(/\r?\n/).find((line) => line.trim()) || '';
  const delimiter = [',', ';', '\t']
    .map((d) => ({ d, n: firstLine.split(d).length }))
    .sort((a, b) => b.n - a.n)[0].d;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(field.trim()); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field.trim()); field = '';
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field.trim());
  if (row.some((c) => c !== '')) rows.push(row);
  return rows;
};
