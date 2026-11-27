'use strict';

const { after, afterEach, before, test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { once } = require('node:events');
const helper = require('node-red-node-test-helper');
// Also run the same contract tests against the actual npm installation.
const media = require(process.env.NODE_RED_MEDIA_TEST_PACKAGE
  ? require.resolve('@acedatacloud/node-red-media/nodes/media', { paths: [path.resolve(process.env.NODE_RED_MEDIA_TEST_PACKAGE)] })
  : '../media/nodes/media');

helper.init(require.resolve('node-red'));
before(() => helper.startServer());
after(() => helper.stopServer());
afterEach(() => helper.unload());

const id = 'task-fixture';
const url = 'https://example.org/output';
const cases = [
  ['suno', '/suno/audios', { action: 'generate', prompt: 'A song' }, { data: [{ audio_url: url, image_url: 'https://example.org/cover', state: 'complete' }] }, 'audio', 'complete'],
  ['acemusic', '/acemusic/audios', { action: 'generate', prompt: 'A song' }, { status: 'partial_failed', data: [{}, { audio_url: url }] }, 'audio', 'partial_failed'],
  ['nano-banana', '/nano-banana/images', { action: 'generate', prompt: 'A boat' }, { data: [{ image_url: url }] }, 'image', 'completed'],
  ['openai', '/openai/images/generations', { model: 'gpt-image-2', prompt: 'A boat' }, { data: [{ url }] }, 'image', 'completed'],
  ['seedream', '/seedream/images', { model: 'doubao-seedream-5-0-lite-260128', prompt: 'A boat' }, { data: [{ image_url: url }] }, 'image', 'completed'],
  ['flux', '/flux/images', { action: 'generate', prompt: 'A boat', size: '1024x1024' }, { data: [{ image_url: url }] }, 'image', 'completed'],
  ['seedance', '/seedance/videos', { model: 'doubao-seedance-1-5-pro-251215', content: [{ type: 'text', text: 'A boat' }] }, { data: { status: 'succeeded', content: { video_url: url } } }, 'video', 'succeeded'],
  ['kling', '/kling/videos', { action: 'text2video', prompt: 'A boat' }, { state: 'succeed', video_url: url }, 'video', 'succeed'],
  ['veo', '/veo/videos', { action: 'text2video', prompt: 'A boat' }, { data: [{ video_url: url, state: 'succeeded' }] }, 'video', 'succeeded'],
  ['hailuo', '/hailuo/videos', { action: 'generate', model: 'minimax-t2v', prompt: 'A boat' }, { data: [{ video_url: url, state: 'succeeded' }] }, 'video', 'succeeded']
];

function load(service, token = 'fixture-token') {
  return helper.load(media, [
    { id: 'tab', type: 'tab', label: 'Media tests' },
    { id: 'account', type: 'acedatacloud-media-account', name: 'Test' },
    { id: 'generate', z: 'tab', x: 100, y: 100, type: 'acedatacloud-media-generate', service, account: 'account', wires: [['accepted']] },
    { id: 'accepted', z: 'tab', x: 100, y: 100, type: 'helper' },
    { id: 'lookup', z: 'tab', x: 100, y: 100, type: 'acedatacloud-media-task', service, account: 'account', wires: [['media'], ['empty']] },
    { id: 'media', z: 'tab', x: 100, y: 100, type: 'helper' },
    { id: 'empty', z: 'tab', x: 100, y: 100, type: 'helper' },
    { id: 'catch', z: 'tab', x: 100, y: 100, type: 'catch', scope: ['generate', 'lookup'], wires: [['errors']] },
    { id: 'errors', z: 'tab', x: 100, y: 100, type: 'helper' }
  ], { account: { token } });
}

async function observe(from, to, msg) {
  const event = once(helper.getNode(to), 'input', { signal: AbortSignal.timeout(3000) });
  helper.getNode(from).receive(msg);
  return (await event)[0];
}

for (const [service, endpoint, input, response, type, state] of cases) {
  test(service + ' submits an async task and retrieves the contracted media field', async t => {
    await load(service);
    const requests = [];
    t.mock.method(globalThis, 'fetch', async (url, options) => {
      requests.push({ url, options });
      return Response.json(requests.length === 1 ? { task_id: id } : {
        id, response: { success: true, task_id: id, ...response }
      });
    });
    const accepted = await observe('generate', 'accepted', { topic: 'topic', payload: input });
    assert.equal(accepted.payload, id);
    assert.equal(accepted.aceService, service);
    const done = await observe('lookup', 'media', accepted);
    assert.equal(done.topic, 'topic');
    assert.deepEqual(done.payload, { id, service, state, assets: [{ type, url }] });
    assert.deepEqual(requests.map(r => [r.url, JSON.parse(r.options.body)]), [
      ['https://api.acedata.cloud' + endpoint, { ...input, async: true }],
      ['https://api.acedata.cloud/' + service + '/tasks', { action: 'retrieve', id }]
    ]);
    for (const { options } of requests) {
      assert.equal(options.headers.Authorization, 'Bearer fixture-token');
      assert.equal(options.method, 'POST');
      assert.equal(options.redirect, 'error');
    }
    assert.ok(!JSON.stringify(done).includes('fixture-token'));
  });
}

for (const service of ['openai', 'seedream']) {
  test(service + ' supports inline image output', async t => {
    await load(service);
    t.mock.method(globalThis, 'fetch', async () => Response.json({
      id, response: { task_id: id, success: true, data: [{ b64_json: 'YWJj' }] }
    }));
    const msg = await observe('lookup', 'media', { payload: id });
    assert.deepEqual(msg.payload.assets, [{ type: 'image', b64_json: 'YWJj' }]);
  });
}

for (const [label, result, state] of [
  ['pending task', { id, response: null }, 'pending'],
  ['terminal failure', { id, response: { success: false } }, 'failed'],
  ['unusable image URLs', { id, response: { success: true, data: [{ url: 'file:///image.png' }, { url: 'https://user:pass@example.org/img' }] } }, 'completed']
]) {
  test(label + ' uses the second lookup output', async t => {
    await load('openai');
    t.mock.method(globalThis, 'fetch', async () => Response.json(result));
    const msg = await observe('lookup', 'empty', { payload: id });
    assert.deepEqual(msg.payload, { id, service: 'openai', state, assets: [] });
  });
}

for (const [label, result, pattern] of [
  ['missing task', {}, /No matching/],
  ['mismatched task', { id, response: { task_id: 'another' } }, /does not match/]
]) {
  test(label + ' is catchable', async t => {
    await load('openai');
    t.mock.method(globalThis, 'fetch', async () => Response.json(result));
    assert.match((await observe('lookup', 'errors', { payload: id })).error.message, pattern);
  });
}

test('rejects a service mismatch before sending the ID', async t => {
  await load('openai');
  const fetch = t.mock.method(globalThis, 'fetch');
  const msg = await observe('lookup', 'errors', { payload: id, aceService: 'suno' });
  assert.match(msg.error.message, /same service/);
  assert.equal(fetch.mock.callCount(), 0);
});

test('authorization failures use Catch without exposing credentials', async t => {
  await load('suno');
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 401 }));
  const msg = await observe('generate', 'errors', { payload: { prompt: 'A song' } });
  assert.match(msg.error.message, /HTTP 401/);
  assert.ok(!JSON.stringify(msg).includes('fixture-token'));
});

test('a submission without an accepted task ID uses Catch and sends once', async t => {
  await load('suno');
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json({ success: false }));
  const msg = await observe('generate', 'errors', { payload: { prompt: 'A song' } });
  assert.match(msg.error.message, /did not return a task ID/);
  assert.equal(fetch.mock.callCount(), 1);
});
