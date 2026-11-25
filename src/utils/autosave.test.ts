import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatSavedTimeLabel,
  getAutosaveStatusText,
  parseAutosaveEnabled,
  parseSavedTimestamp,
  safeReadStorage,
  safeWriteStorage,
  type StorageLike,
} from './autosave';

function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
  };
}

test('safeReadStorage and safeWriteStorage persist values and handle quota errors', () => {
  const mem = createMemoryStorage();
  assert.equal(safeReadStorage('missing', 'fallback', mem), 'fallback');

  const res = safeWriteStorage('code.cpp', 'int main(){}', mem, 1700000000000);
  assert.equal(res.ok, true);
  assert.equal(res.savedAt, 1700000000000);
  assert.equal(safeReadStorage('code.cpp', '', mem), 'int main(){}');

  const failingStorage: StorageLike = {
    getItem: () => null,
    setItem: () => {
      const err = new Error('full');
      err.name = 'QuotaExceededError';
      throw err;
    },
  };
  const failRes = safeWriteStorage('code.cpp', 'x', failingStorage);
  assert.equal(failRes.ok, false);
  assert.match(failRes.error ?? '', /Недостаточно места/);
});

test('parseAutosaveEnabled defaults to true and parses disabled flags', () => {
  assert.equal(parseAutosaveEnabled(null), true);
  assert.equal(parseAutosaveEnabled('true'), true);
  assert.equal(parseAutosaveEnabled('false'), false);
  assert.equal(parseAutosaveEnabled('off'), false);
});

test('parseSavedTimestamp and formatSavedTimeLabel validate and format timestamps', () => {
  assert.equal(parseSavedTimestamp(null), null);
  assert.equal(parseSavedTimestamp('not-a-number'), null);
  assert.equal(parseSavedTimestamp('-5'), null);
  const ts = new Date(2026, 10, 25, 9, 5, 0).getTime();
  assert.equal(parseSavedTimestamp(String(ts)), ts);
  assert.equal(formatSavedTimeLabel(ts), '09:05');
});

test('getAutosaveStatusText formats Russian status labels for every state', () => {
  const ts = new Date(2026, 10, 25, 19, 42, 0).getTime();
  assert.equal(getAutosaveStatusText('saved', ts).shortLabel, 'Сохранено 19:42');
  assert.equal(getAutosaveStatusText('saved', null).shortLabel, 'Автосохранено');
  assert.equal(getAutosaveStatusText('saving', ts).shortLabel, 'Сохранение…');
  assert.equal(getAutosaveStatusText('disabled', ts).shortLabel, 'Автосохр. выкл');
  assert.equal(getAutosaveStatusText('error', ts).shortLabel, 'Ошибка сохр.');
});
