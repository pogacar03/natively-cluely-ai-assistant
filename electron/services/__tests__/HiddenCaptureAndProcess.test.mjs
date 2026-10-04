// Cmd/Ctrl+B hides the overlay. Capture-and-process must still answer the
// screenshot without revealing that overlay, including during its hide delay.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relativePath) => fs.readFileSync(path.resolve(here, relativePath), 'utf8');

test('capture-and-process preserves the hidden window and sends a silent request', () => {
  const main = read('../../main.ts');
  const start = main.indexOf('private async captureScreenAndProcess()');
  const end = main.indexOf('public async takeSelectiveScreenshot', start);
  assert.ok(start >= 0 && end > start);
  const body = main.slice(start, end);

  assert.match(body, /const keepHidden = this\.shouldKeepScreenshotHidden\(\)/);
  assert.match(body, /takeScreenshot\(false,\s*\{\s*preserveMainWindowVisibility: keepHidden,?\s*\}\)/);
  assert.match(body, /if \(!keepHidden\)\s*\{[\s\S]*?this\.showMainWindow\(true\)/);
  assert.match(body, /reveal: !keepHidden/);
  assert.match(body, /await PhoneMirrorService\.getInstance\(\)\.publishScreenshotFile\(screenshotPath\)/);
  assert.ok(body.indexOf('publishScreenshotFile(screenshotPath)') < body.indexOf("'capture-and-process'"));
});

test('capture-and-process runs the answer without expanding a hidden overlay', () => {
  const renderer = read('../../../src/components/NativelyInterface.tsx');
  const handlerStart = renderer.indexOf('window.electronAPI.onCaptureAndProcess((data) => {');
  const handlerEnd = renderer.indexOf('return unsubscribe;', handlerStart);
  assert.ok(handlerStart >= 0 && handlerEnd > handlerStart);
  const handler = renderer.slice(handlerStart, handlerEnd);

  assert.match(handler, /const reveal = shouldRevealScreenshotAttachment\(data\)/);
  assert.match(handler, /if \(reveal\) setIsExpanded\(true\)/);
  assert.match(handler, /handleWhatToSay\(undefined, reveal\)/);
  assert.match(handler, /if \(reveal\) requestAnimationFrame\(runCaptureAnswer\)/);
  assert.match(handler, /else runCaptureAnswer\(\)/);

  const answerStart = renderer.indexOf('const handleWhatToSay = async');
  const answerEnd = renderer.indexOf('const handleFollowUp = async', answerStart);
  assert.ok(answerStart >= 0 && answerEnd > answerStart);
  assert.match(renderer.slice(answerStart, answerEnd), /if \(reveal\) setIsExpanded\(true\)/);
});
