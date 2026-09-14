// Regression test for desktop screenshots delivered to the Phone Mirror.
// The phone client is a real ws client and the service under test is the real
// compiled PhoneMirrorService, so this catches a missing broadcast side effect
// rather than only checking that a method exists.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import Module from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../');
const require = createRequire(path.join(repoRoot, 'package.json'));
const WS = require('ws').WebSocket;
const compiledServicePath = path.resolve(
  repoRoot,
  'dist-electron/electron/services/PhoneMirrorService.js',
);
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'natively-pm-screenshot-'));

const electronStub = {
  app: {
    isReady: () => true,
    getPath: () => userDataDir,
    whenReady: () => Promise.resolve(),
    on: () => {},
  },
  BrowserWindow: class {
    static getFocusedWindow() {
      return null;
    }
    static getAllWindows() {
      return [];
    }
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from('enc:' + s, 'utf8'),
    decryptString: (buf) => Buffer.from(buf).toString('utf8').replace(/^enc:/, ''),
  },
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'electron') return electronStub;
  return originalLoad.call(this, request, parent, isMain);
};

let PhoneMirrorService;

before(async () => {
  const mod = await import(pathToFileURL(compiledServicePath).href);
  PhoneMirrorService = mod.PhoneMirrorService;
});

after(async () => {
  try {
    const service = PhoneMirrorService?.getInstance();
    if (service?.isRunning()) await service.stop({ persist: false });
  } finally {
    Module._load = originalLoad;
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});

test('publishes a screenshot data URL to a connected phone', async () => {
  const service = PhoneMirrorService.getInstance();
  if (service.isRunning()) await service.stop({ persist: false });
  const info = await service.start({ exposeOnLan: false, persist: false });
  let ws;
  let cancelScreenshotWait = () => {};

  try {
    ws = new WS(`ws://127.0.0.1:${info.port}/ws?t=${encodeURIComponent(info.token)}`);
    await new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });

    const screenshotFrame = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('timed out waiting for screenshot frame')), 1000);
      cancelScreenshotWait = () => clearTimeout(timeout);
      ws.on('message', (data) => {
        let frame;
        try {
          frame = JSON.parse(data.toString());
        } catch {
          return;
        }
        if (frame?.type !== 'screenshot') return;
        clearTimeout(timeout);
        resolve(frame);
      });
    });

    service.publishScreenshot('data:image/jpeg;base64,ZmFrZS1zY3JlZW5zaG90');
    const frame = await screenshotFrame;

    assert.equal(frame.type, 'screenshot');
    assert.match(frame.id, /^s:/);
    assert.equal(frame.dataUrl, 'data:image/jpeg;base64,ZmFrZS1zY3JlZW5zaG90');
    assert.equal(typeof frame.createdAt, 'string');
  } finally {
    cancelScreenshotWait?.();
    ws?.close();
    await service.stop({ persist: false });
  }
});
