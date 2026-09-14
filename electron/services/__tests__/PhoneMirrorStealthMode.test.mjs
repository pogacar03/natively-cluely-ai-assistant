// Regression coverage for the hidden Phone Mirror screenshot mode.
// The collapsed renderer state must win over the short native hide grace
// period, while unrelated screenshot states keep the normal path.

import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../');
const compiledHelperPath = path.resolve(
  repoRoot,
  'dist-electron/electron/services/phoneMirrorStealthMode.js',
);

let shouldUsePhoneMirrorStealthMode;

before(async () => {
  const mod = await import(pathToFileURL(compiledHelperPath).href);
  shouldUsePhoneMirrorStealthMode = mod.shouldUsePhoneMirrorStealthMode;
});

test('uses silent capture during the native hide grace period', () => {
  assert.equal(
    shouldUsePhoneMirrorStealthMode({
      windowMode: 'overlay',
      mainWindowVisible: true,
      overlayExpanded: false,
      phoneClients: 1,
    }),
    true,
  );
});

test('uses silent capture after the overlay is physically hidden', () => {
  assert.equal(
    shouldUsePhoneMirrorStealthMode({
      windowMode: 'overlay',
      mainWindowVisible: false,
      overlayExpanded: false,
      phoneClients: 1,
    }),
    true,
  );
});

test('does not use silent capture without a connected phone', () => {
  assert.equal(
    shouldUsePhoneMirrorStealthMode({
      windowMode: 'overlay',
      mainWindowVisible: false,
      overlayExpanded: false,
      phoneClients: 0,
    }),
    false,
  );
});

test('does not use silent capture while the overlay is visible', () => {
  assert.equal(
    shouldUsePhoneMirrorStealthMode({
      windowMode: 'overlay',
      mainWindowVisible: true,
      overlayExpanded: true,
      phoneClients: 1,
    }),
    false,
  );
});

test('does not use silent capture in launcher mode', () => {
  assert.equal(
    shouldUsePhoneMirrorStealthMode({
      windowMode: 'launcher',
      mainWindowVisible: false,
      overlayExpanded: false,
      phoneClients: 1,
    }),
    false,
  );
});
