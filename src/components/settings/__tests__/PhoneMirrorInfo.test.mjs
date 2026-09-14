import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergePhoneMirrorInfo } from '../phoneMirrorInfo.ts';

const fullInfo = {
  running: true,
  enabled: true,
  exposeOnLan: true,
  port: 4123,
  loopbackUrl: 'http://127.0.0.1:4123/?t=token',
  primaryUrl: 'http://100.119.169.177:4123/?t=token',
  lanUrls: ['http://100.119.169.177:4123/?t=token'],
  token: 'token',
  extToken: 'ext-token',
  qrDataUrl: 'data:image/png;base64,qr',
  clients: 0,
  extensionConnected: false,
  bindAddress: '0.0.0.0',
};

test('partial status events preserve the full pairing information', () => {
  const next = mergePhoneMirrorInfo(fullInfo, {
    running: true,
    enabled: true,
    clients: 1,
    extensionConnected: false,
  });

  assert.deepEqual(next, {
    ...fullInfo,
    clients: 1,
  });
});

test('full status events replace stale pairing fields while preserving new fields', () => {
  const next = mergePhoneMirrorInfo(fullInfo, {
    ...fullInfo,
    exposeOnLan: false,
    primaryUrl: 'http://127.0.0.1:4123/?t=new-token',
    lanUrls: [],
    token: 'new-token',
    qrDataUrl: 'data:image/png;base64,new-qr',
    clients: 0,
    bindAddress: '127.0.0.1',
  });

  assert.equal(next.primaryUrl, 'http://127.0.0.1:4123/?t=new-token');
  assert.equal(next.token, 'new-token');
  assert.equal(next.qrDataUrl, 'data:image/png;base64,new-qr');
  assert.equal(next.bindAddress, '127.0.0.1');
  assert.deepEqual(next.lanUrls, []);
});
