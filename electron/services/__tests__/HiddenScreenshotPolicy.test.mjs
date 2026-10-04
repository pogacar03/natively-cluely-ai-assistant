// Regression coverage for screenshot capture while the overlay is hidden.
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
  'dist-electron/electron/services/hiddenScreenshotPolicy.js',
);

let shouldKeepScreenshotHidden;

before(async () => {
  const mod = await import(pathToFileURL(compiledHelperPath).href);
  shouldKeepScreenshotHidden = mod.shouldKeepScreenshotHidden;
});

test('uses silent capture during the native hide grace period', () => {
  assert.equal(
    shouldKeepScreenshotHidden({
      windowMode: 'overlay',
      mainWindowVisible: true,
      overlayExpanded: false,
    }),
    true,
  );
});

test('uses silent capture after the overlay is physically hidden', () => {
  assert.equal(
    shouldKeepScreenshotHidden({
      windowMode: 'overlay',
      mainWindowVisible: false,
      overlayExpanded: true,
    }),
    true,
  );
});

test('does not use silent capture while the overlay is visible', () => {
  assert.equal(
    shouldKeepScreenshotHidden({
      windowMode: 'overlay',
      mainWindowVisible: true,
      overlayExpanded: true,
    }),
    false,
  );
});

test('does not use silent capture in launcher mode', () => {
  assert.equal(
    shouldKeepScreenshotHidden({
      windowMode: 'launcher',
      mainWindowVisible: false,
      overlayExpanded: false,
    }),
    false,
  );
});
