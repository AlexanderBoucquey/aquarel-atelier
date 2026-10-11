import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sheetToRecords, text, bool, date, link } from '../scripts/lib/cells.mjs';

test('sheetToRecords maps by header name: case, spaces and column order do not matter', () => {
  const rows = [[' Titel  NL ', 'BESTAND', 'Tonen', 'Eigen kolom'], ['Haven', 'haven.jpg', true, 'x'], ['Bos']];
  assert.deepEqual(sheetToRecords(rows), [
    { rowNumber: 2, 'titel nl': 'Haven', bestand: 'haven.jpg', tonen: true, 'eigen kolom': 'x' },
    { rowNumber: 3, 'titel nl': 'Bos', bestand: undefined, tonen: undefined, 'eigen kolom': undefined },
  ]);
});

test('sheetToRecords on an empty or missing tab', () => {
  assert.deepEqual(sheetToRecords([]), []);
  assert.deepEqual(sheetToRecords(undefined), []);
});

test('text trims and turns numbers into strings', () => {
  assert.equal(text('  Haven '), 'Haven');
  assert.equal(text(2024), '2024');
  assert.equal(text(null), '');
});

test('bool reads checkboxes and typed words, falls back when empty or unknown', () => {
  assert.equal(bool(true, false), true);
  assert.equal(bool(false, true), false);
  assert.equal(bool('TRUE', false), true);
  assert.equal(bool('nee', true), false);
  assert.equal(bool('x', false), true);
  assert.equal(bool('', true), true);
  assert.equal(bool(undefined, false), false);
  assert.equal(bool('misschien', true), true);
});

test('date converts Google Sheets serial numbers', () => {
  assert.deepEqual(date(46338), { value: '2026-11-12', error: false });
});

test('date parses Belgian day/month/year text and ISO dates', () => {
  for (const typed of ['12/11/2026', '12-11-2026', '12.11.2026', '2026-11-12', ' 12/11/2026 ']) {
    assert.deepEqual(date(typed), { value: '2026-11-12', error: false }, typed);
  }
  assert.deepEqual(date('1/2/2027'), { value: '2027-02-01', error: false });
});

test('date flags text that is not a date and impossible dates; empty is fine', () => {
  assert.deepEqual(date('volgende week'), { value: null, error: true });
  assert.deepEqual(date('31/02/2026'), { value: null, error: true });
  assert.deepEqual(date(''), { value: null, error: false });
  assert.deepEqual(date(undefined), { value: null, error: false });
});

test('link accepts http(s) and www., rejects anything else', () => {
  assert.equal(link('www.cc-brasschaat.be/expo'), 'https://www.cc-brasschaat.be/expo');
  assert.equal(link('https://example.be'), 'https://example.be/');
  assert.equal(link('javascript:alert(1)'), null);
  assert.equal(link('gewoon tekst'), null);
  assert.equal(link(''), null);
});
