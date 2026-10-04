import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const { LLMHelper } = require(path.join(root, 'dist-electron/electron/LLMHelper.js'));
const { getModelCapabilities } = require(path.join(root, 'dist-electron/electron/llm/modelCapabilities.js'));

function helperWithFakeDeepseek(requests, stream = false) {
  const helper = Object.create(LLMHelper.prototype);
  Object.defineProperties(helper, {
    isLocalOnlyMode: { value: false },
    deepseekClient: { value: {
      chat: { completions: { create: async (request) => {
        requests.push(request);
        if (stream) return (async function* () {
          yield { choices: [{ delta: { content: 'image read' } }] };
        })();
        return { choices: [{ message: { content: 'image read' } }] };
      } } },
    } },
  });
  helper.currentModelId = 'deepseek-flash';
  helper.rateLimiters = { deepseek: { acquire: async () => {} } };
  helper.assertOutboundScopes = (_provider, _text, paths) => {
    assert.deepEqual(paths, ['/tmp/screenshot.png']);
  };
  helper.buildOpenAiImageParts = async (paths) => {
    assert.deepEqual(paths, ['/tmp/screenshot.png']);
    return [{ type: 'image_url', image_url: { url: 'data:image/png;base64,aGVsbG8=' } }];
  };
  helper.withRetry = async (fn) => fn();
  helper.withTimeout = async (promise) => promise;
  helper.getDeepseekMaxOutput = () => 1024;
  return helper;
}

test('DeepSeek Flash is a vision-capable cloud model; Pro remains text-only', () => {
  assert.equal(getModelCapabilities('deepseek-flash', false).supportsImages, true);
  assert.equal(getModelCapabilities('deepseek-v4-flash', false).supportsImages, true);
  assert.equal(getModelCapabilities('deepseek-v4-flash-vision-exp', false).supportsImages, true);
  assert.equal(getModelCapabilities('deepseek-v4-pro', false).supportsImages, false);
});

test('Direct Assist accepts screenshots for Flash but not Pro', () => {
  const helper = Object.create(LLMHelper.prototype);
  assert.equal(helper.directSelectionSupportsImages({ provider: 'deepseek', model: 'deepseek-flash' }, null, null), true);
  assert.equal(helper.directSelectionSupportsImages({ provider: 'deepseek', model: 'deepseek-v4-pro' }, null, null), false);
});

test('DeepSeek non-streaming image request uses image_url parts', async () => {
  const requests = [];
  const helper = helperWithFakeDeepseek(requests);
  const answer = await helper.generateWithDeepseek('Read this', 'Be concise', 'deepseek-flash', ['/tmp/screenshot.png']);
  assert.equal(answer, 'image read');
  assert.equal(requests[0].model, 'deepseek-flash');
  assert.deepEqual(requests[0].messages[1].content, [
    { type: 'text', text: 'Read this' },
    { type: 'image_url', image_url: { url: 'data:image/png;base64,aGVsbG8=' } },
  ]);
});

test('DeepSeek streamed image request keeps the screenshot and selected model', async () => {
  const requests = [];
  const helper = helperWithFakeDeepseek(requests, true);
  const chunks = [];
  for await (const chunk of helper.streamWithDeepseek('Read this', 'Be concise', 'deepseek-flash', undefined, ['/tmp/screenshot.png'])) {
    chunks.push(chunk);
  }
  assert.deepEqual(chunks, ['image read']);
  assert.equal(requests[0].model, 'deepseek-flash');
  assert.equal(requests[0].messages[1].content[1].type, 'image_url');
});

test('DeepSeek Pro refuses image input before sending a request', async () => {
  const requests = [];
  const helper = helperWithFakeDeepseek(requests);
  await assert.rejects(
    helper.generateWithDeepseek('Read this', undefined, 'deepseek-v4-pro', ['/tmp/screenshot.png']),
    /does not support image input/,
  );
  assert.equal(requests.length, 0);
});
