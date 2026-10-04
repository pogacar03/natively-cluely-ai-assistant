import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const client = fs.readFileSync(path.resolve(here, '../phoneMirrorClient.ts'), 'utf8');

test('new phone content follows the bottom, including after the original image loads', () => {
  const imageStart = client.indexOf("if (m.type === 'screenshot')");
  const imageEnd = client.indexOf("if (m.type === 'screenshot-queued')", imageStart);
  assert.ok(imageStart >= 0 && imageEnd > imageStart);
  assert.match(client.slice(imageStart, imageEnd), /image\.addEventListener\('load',\s*\(\) => scrollToLatest\(true\)\)/);

  const renderStart = client.indexOf('function render()');
  const renderEnd = client.indexOf('let liveRenderRaf', renderStart);
  assert.ok(renderStart >= 0 && renderEnd > renderStart);
  assert.match(client.slice(renderStart, renderEnd), /scrollToLatest\(true\)/);

  const flushStart = client.indexOf('function flushLiveRender()');
  const flushEnd = client.indexOf('function scheduleLiveRender()', flushStart);
  assert.ok(flushStart >= 0 && flushEnd > flushStart);
  assert.match(client.slice(flushStart, flushEnd), /scrollToLatest\(true\)/);
});
