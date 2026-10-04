// electron/services/__tests__/AuditFixesSourceGuards.test.mjs
//
// Structural regression guards for audit fixes whose code lives in classes that
// can't be cheaply instantiated in a unit test (AppState in main.ts, the IPC
// handler closures in ipcHandlers.ts). Mirrors the existing source-assertion
// pattern (see MeetingPersistenceRace.test.mjs). These assert the load-bearing
// shape of each fix so a refactor can't silently revert it. Behavioral coverage
// for the testable pieces lives in the sibling suites:
//   - SaveMeetingIdempotency.test.mjs   (#1)
//   - ChatStreamGuard.test.mjs          (#3, renderer reducer)
//   - GeminiAbortPropagation.test.mjs   (#4)
//   - RollingTranscriptState.test.mjs   (#7, the cap helper)
//   - ModeHybridChunkCache.test.mjs     (#8)
//   - IntelligenceTraceCorrelation.test.mjs (#9)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8');

describe('#2 phone-mirror stream identity is independent of the desktop counter', () => {
  const src = read('../../ipcHandlers.ts');

  test('a dedicated phone supersession marker exists', () => {
    assert.match(src, /_phoneChatLatestId\s*=\s*0/, 'phone path must have its own supersession counter');
  });

  test('phone supersession compares the phone marker, NOT the shared _chatStreamId', () => {
    // The phone block must check _phoneChatLatestId for supersession.
    assert.match(src, /_phoneChatLatestId\s*!==\s*myPhoneId/, 'phone shouldAbort must compare _phoneChatLatestId');
    // And it must NOT gate phone supersession on the shared global id any more.
    assert.doesNotMatch(src, /_chatStreamId\s*!==\s*myStreamId/,
      'phone path must no longer supersede on the desktop-shared _chatStreamId');
  });

  test('the phone done/error gates use the phone marker', () => {
    const phoneDoneGate = /_phoneChatLatestId\s*===\s*myPhoneId/g;
    const matches = src.match(phoneDoneGate) || [];
    assert.ok(matches.length >= 2, 'phone done + error finalization must gate on _phoneChatLatestId');
  });
});

describe('#5 sleep/wake recreates STT providers, not just captures', () => {
  const src = read('../../main.ts');
  const start = src.indexOf('public async restartCapturesAfterResume');
  const end = src.indexOf('private broadcastDeviceSelection', start);
  assert.ok(start >= 0 && end > start, 'restartCapturesAfterResume must be isolatable');
  const body = src.slice(start, end);

  test('tears down the old STT providers on resume', () => {
    assert.match(body, /this\.googleSTT\s*=\s*null/, 'must null the interviewer STT on resume');
    assert.match(body, /this\.googleSTT_User\s*=\s*null/, 'must null the user STT on resume');
  });

  test('recreates + starts fresh STT providers on resume', () => {
    assert.match(body, /this\.googleSTT\s*=\s*this\.createSTTProvider\('interviewer'\)/,
      'must recreate the interviewer STT');
    assert.match(body, /this\.googleSTT_User\s*=\s*this\.createSTTProvider\('user'\)/,
      'must recreate the user STT');
    assert.match(body, /this\.googleSTT\?\.\s*start\(\)/, 'must start the recreated interviewer STT');
    assert.match(body, /this\.googleSTT_User\?\.\s*start\(\)/, 'must start the recreated user STT');
  });
});

describe('#7 main-side partial transcript throttle (finals pass through)', () => {
  const src = read('../../main.ts');

  test('a throttle method routes the display-only transcript IPC', () => {
    assert.match(src, /sendThrottledTranscript\(/, 'transcript send must go through the throttle');
    assert.match(src, /private sendThrottledTranscript/, 'throttle method must exist');
  });

  test('finals are emitted immediately (not coalesced)', () => {
    const start = src.indexOf('private sendThrottledTranscript');
    const end = src.indexOf('private clearTranscriptThrottle', start);
    const body = src.slice(start, end);
    assert.match(body, /if\s*\(\s*payload\.final\s*\)/, 'finals branch must exist');
    // The final branch must emit synchronously (no setTimeout around the final send).
    const finalBranch = body.slice(body.indexOf('if (payload.final'));
    assert.match(finalBranch, /this\.emitTranscriptToSurfaces\(payload\)/, 'final must emit immediately');
  });

  test('throttle is cleared on meeting teardown', () => {
    assert.match(src, /this\.clearTranscriptThrottle\(\)/, 'teardown must clear pending partials');
  });
});

describe('#3 stream id is emitted on the wire (backward-compatible 2nd arg)', () => {
  const src = read('../../ipcHandlers.ts');
  test('chat tokens carry { streamId }', () => {
    assert.match(src, /send\('gemini-stream-token',\s*visible,\s*\{\s*streamId:\s*myStreamId\s*\}\)/,
      'desktop sendChunk must include streamId');
  });
  test('phone tokens carry { streamId }', () => {
    // F-303: the phone payload also carries `source: 'phone'` so the renderer
    // can scope supersession to a surface. The invariant this test protects is
    // that phone tokens carry a streamId — assert that without pinning the
    // payload to EXACTLY one field.
    assert.match(src, /send\('gemini-stream-token',\s*token,\s*\{\s*streamId:\s*myStreamId\b/,
      'phone onToken must include streamId');
  });
});

describe('Phone Mirror receives desktop screenshot-and-answer output', () => {
  const ipcSrc = read('../../ipcHandlers.ts');
  const mainSrc = read('../../main.ts');

  test('V3 desktop answer tokens are forwarded to Phone Mirror', () => {
    const streamStart = ipcSrc.indexOf('const v3Stream = llmHelper.streamChatWithOutcome(');
    const streamEnd = ipcSrc.indexOf('// Defect G (2026-08-01)', streamStart);
    assert.ok(streamStart >= 0 && streamEnd > streamStart, 'V3 stream block must be locatable');
    const v3StreamBlock = ipcSrc.slice(streamStart, streamEnd);
    assert.match(
      v3StreamBlock,
      /PhoneMirrorService\.getInstance\(\)\.publishToken\(String\(myStreamId\),\s*tok\)/,
      'every V3 desktop token must be mirrored to the phone',
    );
    assert.match(
      ipcSrc,
      /PhoneMirrorService\.getInstance\(\)\.publishDone\(String\(myStreamId\),\s*finalText,\s*'Chat'\)/,
      'the V3 desktop stream must finalize once on the phone',
    );
    assert.doesNotMatch(
      v3StreamBlock,
      /publishAssistantMessage\(String\(myStreamId\),\s*finalText/,
      'V3 must not append a second assistant card after streaming completes',
    );
  });

  test('capture-and-process broadcasts the original screenshot before starting the answer', () => {
    const start = mainSrc.indexOf('private async captureScreenAndProcess()');
    const end = mainSrc.indexOf('  /**', start + 1);
    assert.ok(start >= 0 && end > start, 'capture-and-process method must be locatable');
    const body = mainSrc.slice(start, end);
    assert.match(body, /await PhoneMirrorService\.getInstance\(\)\.publishScreenshotFile\(screenshotPath\)/,
      'capture-and-process original screenshot must be sent to the phone');
  });

  test('selective screenshots also broadcast the original file', () => {
    const start = ipcSrc.indexOf("safeHandle('take-selective-screenshot'");
    const end = ipcSrc.indexOf("safeHandle('get-screenshots'", start);
    assert.ok(start >= 0 && end > start, 'selective screenshot handler must be locatable');
    const body = ipcSrc.slice(start, end);
    assert.match(body, /await PhoneMirrorService\.getInstance\(\)\.publishScreenshotFile\(screenshotPath\)/,
      'selective screenshot original must be sent to the phone');
  });
});
