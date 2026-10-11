import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchTabs, findFolder } from '../scripts/fetch.mjs';

test('matchTabs finds tabs regardless of case and spaces, null when missing', () => {
  assert.deepEqual(matchTabs(['werken ', 'TENTOONSTELLINGEN', 'Blad1']), { werken: 'werken ', tentoonstellingen: 'TENTOONSTELLINGEN', teksten: null });
});

test('findFolder only matches folders', () => {
  const children = [
    { id: 'p1', name: 'Werken', mimeType: 'image/jpeg' },
    { id: 'f1', name: ' werken', mimeType: 'application/vnd.google-apps.folder' },
  ];
  assert.equal(findFolder(children, 'Werken').id, 'f1');
  assert.equal(findFolder(children, 'Tentoonstellingen'), null);
});
