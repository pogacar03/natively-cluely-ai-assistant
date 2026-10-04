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

test('publishes streamed model output with one labeled completion frame', async () => {
  const service = PhoneMirrorService.getInstance();
  if (service.isRunning()) await service.stop({ persist: false });
  const info = await service.start({ exposeOnLan: false, persist: false });
  let ws;

  try {
    ws = new WS(`ws://127.0.0.1:${info.port}/ws?t=${encodeURIComponent(info.token)}`);
    await new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });

    const frames = [];
    ws.on('message', (data) => {
      try { frames.push(JSON.parse(data.toString())); } catch {}
    });

    service.publishToken('stream-1', 'Hello');
    service.publishToken('stream-1', ' phone');
    service.publishDone('stream-1', 'Hello phone', 'Chat');

    await new Promise((resolve) => setTimeout(resolve, 20));
    const tokenFrames = frames.filter((frame) => frame.type === 'token');
    const doneFrames = frames.filter((frame) => frame.type === 'done');
    assert.deepEqual(tokenFrames.map((frame) => frame.token), ['Hello', ' phone']);
    assert.equal(doneFrames.length, 1);
    assert.equal(doneFrames[0].content, 'Hello phone');
    assert.equal(doneFrames[0].label, 'Chat');
  } finally {
    ws?.close();
    await service.stop({ persist: false });
  }
});

test('sends the original PNG bytes before subsequent answer frames', async () => {
  const service = PhoneMirrorService.getInstance();
  if (service.isRunning()) await service.stop({ persist: false });
  const info = await service.start({ exposeOnLan: false, persist: false });
  const original = Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    Buffer.alloc(1_200_000, 0x7b),
  ]);
  const screenshotsDir = path.join(userDataDir, 'screenshots');
  fs.mkdirSync(screenshotsDir, { recursive: true });
  const screenshotPath = path.join(screenshotsDir, 'original.png');
  fs.writeFileSync(screenshotPath, original);
  let ws;

  try {
    ws = new WS(`ws://127.0.0.1:${info.port}/ws?t=${encodeURIComponent(info.token)}`);
    await new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });
    const frames = [];
    const received = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('timed out waiting for all frames')), 3000);
      ws.on('message', (data) => {
        try { frames.push(JSON.parse(data.toString())); } catch {}
        if (frames.some((frame) => frame.type === 'done')) {
          clearTimeout(timeout);
          resolve();
        }
      });
    });

    await service.publishScreenshotFile(screenshotPath);
    // Model a phone whose original-image frame is still buffered. The old
    // 1 MB guard silently dropped the answer in precisely this state.
    const serverSocket = [...service.wss.clients][0];
    Object.defineProperty(serverSocket, 'bufferedAmount', {
      configurable: true,
      get: () => 2_000_000,
    });
    service.publishToken('image-answer', 'Answer');
    service.publishDone('image-answer', 'Answer', 'What to Answer');
    await received;

    const relevant = frames.filter((frame) => ['screenshot', 'token', 'done'].includes(frame.type));
    assert.deepEqual(relevant.map((frame) => frame.type), ['screenshot', 'token', 'done']);
    assert.equal(relevant[0].dataUrl, `data:image/png;base64,${original.toString('base64')}`);
    assert.equal(relevant[2].content, 'Answer');
  } finally {
    ws?.close();
    await service.stop({ persist: false });
  }
});

test('does not send a PNG outside the app screenshot directory to the phone', async () => {
  const service = PhoneMirrorService.getInstance();
  if (service.isRunning()) await service.stop({ persist: false });
  const info = await service.start({ exposeOnLan: false, persist: false });
  const outsidePath = path.join(userDataDir, 'private.png');
  const screenshotsDir = path.join(userDataDir, 'screenshots');
  fs.mkdirSync(screenshotsDir, { recursive: true });
  fs.writeFileSync(outsidePath, Buffer.from('89504e470d0a1a0a', 'hex'));
  const linkedPath = path.join(screenshotsDir, 'linked.png');
  fs.symlinkSync(outsidePath, linkedPath);
  let ws;

  try {
    ws = new WS(`ws://127.0.0.1:${info.port}/ws?t=${encodeURIComponent(info.token)}`);
    await new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });
    const frames = [];
    ws.on('message', (data) => {
      try { frames.push(JSON.parse(data.toString())); } catch {}
    });

    await service.publishScreenshotFile(outsidePath);
    await service.publishScreenshotFile(linkedPath);
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(frames.filter((frame) => frame.type === 'screenshot').length, 0);
  } finally {
    ws?.close();
    await service.stop({ persist: false });
  }
});
