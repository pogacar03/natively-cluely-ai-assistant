// Regression coverage for the separate Phone Mirror screenshot preview profile.
// The desktop renderer keeps its compact 480px preview, while the phone gets a
// sharper 1080p-class image.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import Module from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../');
const compiledHelperPath = path.resolve(
  repoRoot,
  'dist-electron/electron/ScreenshotHelper.js',
);
const require = createRequire(path.join(repoRoot, 'package.json'));
const sharp = require('sharp');
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'natively-preview-profile-'));

const electronStub = {
  app: {
    isPackaged: false,
    getPath: () => userDataDir,
  },
  desktopCapturer: {},
  screen: {},
  systemPreferences: {},
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'electron') return electronStub;
  return originalLoad.call(this, request, parent, isMain);
};

let ScreenshotHelper;

before(async () => {
  const mod = await import(pathToFileURL(compiledHelperPath).href);
  ScreenshotHelper = mod.ScreenshotHelper;
});

after(() => {
  Module._load = originalLoad;
  fs.rmSync(userDataDir, { recursive: true, force: true });
});

function decodeDataUrl(dataUrl) {
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

test('phone preview is 1080p-class while the desktop preview stays compact', async () => {
  const sourcePath = path.join(userDataDir, 'source.png');
  await sharp({
    create: {
      width: 3840,
      height: 2160,
      channels: 3,
      background: { r: 24, g: 48, b: 72 },
    },
  }).png().toFile(sourcePath);

  const helper = new ScreenshotHelper('queue');
  const desktopPreview = await helper.getImagePreview(sourcePath);
  const phonePreview = await helper.getImagePreview(sourcePath, {
    maxWidth: 1920,
    maxHeight: 1080,
    quality: 80,
  });

  const desktopSize = await sharp(decodeDataUrl(desktopPreview)).metadata();
  const phoneSize = await sharp(decodeDataUrl(phonePreview)).metadata();

  assert.deepEqual(
    { width: desktopSize.width, height: desktopSize.height },
    { width: 480, height: 270 },
    'desktop preview should remain the compact 480px profile',
  );
  assert.deepEqual(
    { width: phoneSize.width, height: phoneSize.height },
    { width: 1920, height: 1080 },
    'phone preview should use the 1920×1080 profile',
  );
});
