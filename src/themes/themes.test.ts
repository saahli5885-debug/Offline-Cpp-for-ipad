import test from 'node:test';
import assert from 'node:assert/strict';
import { APP_THEMES, getThemeById, normalizeThemeId } from './themes';

test('APP_THEMES provides 6 distinct themes across dark and light modes', () => {
  assert.equal(APP_THEMES.length, 6);
  const ids = new Set(APP_THEMES.map((t) => t.id));
  assert.equal(ids.size, 6);
  const darkCount = APP_THEMES.filter((t) => t.mode === 'dark').length;
  const lightCount = APP_THEMES.filter((t) => t.mode === 'light').length;
  assert.equal(darkCount, 4);
  assert.equal(lightCount, 2);
});

test('normalizeThemeId migrates legacy dark/light values and falls back safely', () => {
  assert.equal(normalizeThemeId('dark'), 'github-dark');
  assert.equal(normalizeThemeId('light'), 'github-light');
  assert.equal(normalizeThemeId('dracula'), 'dracula');
  assert.equal(normalizeThemeId('nord'), 'nord');
  assert.equal(normalizeThemeId('monokai'), 'monokai');
  assert.equal(normalizeThemeId('solarized-light'), 'solarized-light');
  assert.equal(normalizeThemeId('unknown-theme'), 'github-dark');
  assert.equal(normalizeThemeId(null), 'github-dark');
});

test('getThemeById returns complete theme tokens for every theme', () => {
  for (const theme of APP_THEMES) {
    const resolved = getThemeById(theme.id);
    assert.equal(resolved.id, theme.id);
    assert.match(resolved.ui.bgApp, /^#[0-9A-Fa-f]{6}$/);
    assert.match(resolved.ui.themeColorMeta, /^#[0-9A-Fa-f]{6}$/);
    assert.equal(resolved.swatches.length, 3);
  }
});
