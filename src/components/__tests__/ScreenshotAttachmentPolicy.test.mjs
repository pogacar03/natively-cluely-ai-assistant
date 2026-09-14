import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldRevealScreenshotAttachment } from '../screenshotAttachmentPolicy.ts';

test('normal screenshot attachments reveal the overlay', () => {
  assert.equal(shouldRevealScreenshotAttachment({ path: '/tmp/shot.png', preview: 'data:image/png;base64,x' }), true);
  assert.equal(shouldRevealScreenshotAttachment({ path: '/tmp/shot.png', preview: 'data:image/png;base64,x', reveal: true }), true);
});

test('silent screenshot attachments stay attached without revealing the overlay', () => {
  assert.equal(shouldRevealScreenshotAttachment({ path: '/tmp/shot.png', preview: 'data:image/png;base64,x', reveal: false }), false);
});
