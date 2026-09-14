// Regression test for LAN pairing URLs on networks that assign RFC6598
// shared-address space (100.64.0.0/10), such as some campus and carrier Wi-Fi.
// The service must advertise the active interface instead of leaving the URL
// blank after successfully binding to 0.0.0.0.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Module from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../');
const compiledServicePath = path.resolve(
  repoRoot,
  'dist-electron/electron/services/PhoneMirrorService.js',
);
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'natively-pm-lan-address-'));

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
const originalNetworkInterfaces = os.networkInterfaces;

Module._load = function (request, parent, isMain) {
  if (request === 'electron') return electronStub;
  return originalLoad.call(this, request, parent, isMain);
};

// Reproduce the user's active Wi-Fi address. It is valid on the local network,
// but it is outside the three RFC1918 ranges the old filter accepted.
os.networkInterfaces = () => ({
  en0: [
    {
      address: '100.119.169.177',
      netmask: '255.255.252.0',
      family: 'IPv4',
      internal: false,
    },
  ],
});

let PhoneMirrorService;

test.before(async () => {
  const mod = await import(pathToFileURL(compiledServicePath).href);
  PhoneMirrorService = mod.PhoneMirrorService;
});

test.after(async () => {
  try {
    const service = PhoneMirrorService?.getInstance();
    if (service?.isRunning()) await service.stop({ persist: false });
  } finally {
    os.networkInterfaces = originalNetworkInterfaces;
    Module._load = originalLoad;
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});

test('advertises an RFC6598 LAN URL when the active interface uses 100.64.0.0/10', async () => {
  const service = PhoneMirrorService.getInstance();
  if (service.isRunning()) await service.stop({ persist: false });

  const info = await service.start({ exposeOnLan: true, persist: false });
  try {
    const expectedUrlPrefix = `http://100.119.169.177:${info.port}/?t=`;
    assert.ok(
      info.lanUrls.some((url) => url.startsWith(expectedUrlPrefix)),
      `expected an advertised LAN URL for 100.119.169.177, got ${JSON.stringify(info.lanUrls)}`,
    );
    assert.ok(info.primaryUrl?.startsWith(expectedUrlPrefix));
    assert.ok(info.qrDataUrl?.startsWith('data:image/'));
  } finally {
    await service.stop({ persist: false });
  }
});
