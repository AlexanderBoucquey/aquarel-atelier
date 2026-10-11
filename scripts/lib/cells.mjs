// Raw Google Sheets values (valueRenderOption UNFORMATTED_VALUE, dates as serial numbers) → clean JS values.

/** Sheet rows (first row = headers) → records keyed by normalized header, plus rowNumber as shown in Sheets. */
export function sheetToRecords(rows = []) {
  const [header = [], ...body] = rows;
  const keys = header.map((h) => text(h).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()); // 'Tonen ☑' → 'tonen'
  return body.map((cells, index) => {
    const record = { rowNumber: index + 2 };
    keys.forEach((key, i) => {
      if (key) record[key] = cells[i];
    });
    return record;
  });
}

export function text(value) {
  return value == null ? '' : String(value).trim();
}

const TRUE_WORDS = new Set(['true', 'waar', 'ja', 'yes', 'x', 'v', '1']);
const FALSE_WORDS = new Set(['false', 'onwaar', 'nee', 'no', '0']);

/** Checkbox (or typed yes/no) → boolean; empty or unrecognised → fallback. */
export function bool(value, fallback) {
  if (typeof value === 'boolean') return value;
  const word = text(value).toLowerCase();
  if (TRUE_WORDS.has(word)) return true;
  if (FALSE_WORDS.has(word)) return false;
  return fallback;
}

const SHEETS_EPOCH = Date.UTC(1899, 11, 30);
const DAY = 86_400_000;
const FIRST_SERIAL = 3000; // 1908-03-18; smaller numbers are typed years or counts, not dates
const LAST_SERIAL = 109574; // 2199-12-31; larger numbers are e.g. a pasted phone number

/**
 * Date cell → { value: 'YYYY-MM-DD' | null, error }. Accepts Sheets serial numbers, d/m/yyyy (also with - or .)
 * and yyyy-mm-dd. error = the cell has content that is not a valid date.
 */
export function date(value) {
  if (typeof value === 'number') {
    if (!(value >= FIRST_SERIAL && value <= LAST_SERIAL)) return { value: null, error: true };
    return { value: new Date(SHEETS_EPOCH + Math.floor(value) * DAY).toISOString().slice(0, 10), error: false };
  }
  const typed = text(value);
  if (!typed) return { value: null, error: false };
  let m = typed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return ymd(+m[1], +m[2], +m[3]);
  m = typed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return ymd(+m[3], +m[2], +m[1]);
  return { value: null, error: true };
}

function ymd(year, month, day) {
  const d = new Date(Date.UTC(year, month - 1, day));
  const valid = d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
  return valid ? { value: d.toISOString().slice(0, 10), error: false } : { value: null, error: true };
}

/** Typed link → absolute http(s) URL or null. "www.x.be" becomes "https://www.x.be/". */
export function link(value) {
  let typed = text(value);
  if (!typed) return null;
  if (/^www\./i.test(typed)) typed = `https://${typed}`;
  try {
    const url = new URL(typed);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}
