import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectIOSPlatform,
  detectStandaloneMode,
  getThemeColorHex,
  resolveInstallAction,
} from './pwa';

test('detectStandaloneMode detects both matchMedia standalone and iOS navigator.standalone', () => {
  assert.equal(detectStandaloneMode(true, false), true);
  assert.equal(detectStandaloneMode(false, true), true);
  assert.equal(detectStandaloneMode(false, false), false);
  assert.equal(detectStandaloneMode(false, undefined), false);
});

test('detectIOSPlatform identifies iPhone, iPad, and modern iPadOS desktop-mode Safari', () => {
  assert.equal(
    detectIOSPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 'iPhone', 5),
    true
  );
  assert.equal(
    detectIOSPlatform('Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)', 'iPad', 5),
    true
  );
  // Modern iPadOS reports Macintosh + MacIntel with maxTouchPoints > 1
  assert.equal(
    detectIOSPlatform(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      'MacIntel',
      5
    ),
    true
  );
  // Real macOS desktop has 0 touch points
  assert.equal(
    detectIOSPlatform(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
      'MacIntel',
      0
    ),
    false
  );
  assert.equal(
    detectIOSPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0', 'Win32', 0),
    false
  );
});

test('resolveInstallAction hides button in standalone mode and selects right prompt mode', () => {
  assert.equal(
    resolveInstallAction({ isInstalled: true, hasDeferredPrompt: true, isIOS: false }),
    'hidden'
  );
  assert.equal(
    resolveInstallAction({ isInstalled: true, hasDeferredPrompt: false, isIOS: true }),
    'hidden'
  );
  assert.equal(
    resolveInstallAction({ isInstalled: false, hasDeferredPrompt: true, isIOS: false }),
    'native-prompt'
  );
  assert.equal(
    resolveInstallAction({ isInstalled: false, hasDeferredPrompt: false, isIOS: true }),
    'ios-guide'
  );
  assert.equal(
    resolveInstallAction({ isInstalled: false, hasDeferredPrompt: false, isIOS: false }),
    'manual-guide'
  );
});

test('getThemeColorHex matches dark and light topbar palette', () => {
  assert.equal(getThemeColorHex('dark'), '#0D1117');
  assert.equal(getThemeColorHex('light'), '#F3F5F8');
});
