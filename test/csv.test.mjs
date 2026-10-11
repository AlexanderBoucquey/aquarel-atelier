import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, stringifyCsv } from '../scripts/lib/csv.mjs';

test('parses rows', () => {
  assert.deepEqual(parseCsv('a,b\n1,2\n'), [['a', 'b'], ['1', '2']]);
});

test('handles quotes, commas, embedded newlines and CRLF', () => {
  const text = 'name,note\r\n"Haven, Antwerpen","zei ""hallo""\nen ging"\r\n';
  assert.deepEqual(parseCsv(text), [['name', 'note'], ['Haven, Antwerpen', 'zei "hallo"\nen ging']]);
});

test('empty input gives no rows', () => {
  assert.deepEqual(parseCsv(''), []);
});

test('stringify round-trips tricky values', () => {
  const rows = [['uuid', 'file_name'], ['abc', 'IMG 1, "best".jpg'], ['def', '']];
  assert.deepEqual(parseCsv(stringifyCsv(rows)), rows);
  assert.ok(stringifyCsv(rows).endsWith('\n'));
});
