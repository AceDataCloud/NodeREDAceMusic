'use strict';

const { after, afterEach, before, test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const path = require('node:path');
const helper = require('node-red-node-test-helper');
const packageDirectory = process.env.NODE_RED_SUNO_TEST_PACKAGE;
const nodes = ['suno-account', 'suno-generate', 'suno-task'].map(name => require(packageDirectory
  ? require.resolve('@acedatacloud/node-red-suno/nodes/' + name, { paths: [path.resolve(packageDirectory)] })
  : '../suno/nodes/' + name));

helper.init(require.resolve('node-red'));
before(() => helper.startServer());
after(() => helper.stopServer());
afterEach(() => helper.unload());

const id = 'suno-task-fixture';
const audio = 'https://example.org/song.mp3';
const song = { id: 'song-1', title: 'Rainy afternoon', audio_url: audio, state: 'succeeded', duration: 54.2 };
const completed = { id, response: { success: true, task_id: id, data: [song] } };

function load(token = 'fixture-token') {
  return helper.load(nodes, [
    { id: 'tab', type: 'tab', label: 'Suno tests' },
    { id: 'account', type: 'acedatacloud-suno-account', name: 'Suno' },
    { id: 'generate', type: 'acedatacloud-suno-generate', z: 'tab', x: 100, y: 80, account: 'account', wires: [['accepted']] },
    { id: 'accepted', type: 'helper', z: 'tab' },
    { id: 'task', type: 'acedatacloud-suno-task', z: 'tab', x: 100, y: 140, account: 'account', wires: [['tracks'], ['progress']] },
    { id: 'tracks', type: 'helper', z: 'tab' },
    { id: 'progress', type: 'helper', z: 'tab' },
    { id: 'catch', type: 'catch', z: 'tab', x: 100, y: 200, scope: ['generate', 'task'], wires: [['errors']] },
    { id: 'errors', type: 'helper', z: 'tab' }
  ], { account: { token } });
}

async function observe(from, to, msg) {
  const received = once(helper.getNode(to), 'input', { signal: AbortSignal.timeout(3000) });
  helper.getNode(from).receive(msg);
  return (await received)[0];
}

test('submits one asynchronous request then looks up the accepted Suno task', async t => {
  await load();
  const body = { action: 'generate', model: 'chirp-v6', prompt: 'A piano instrumental' };
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options });
    return Response.json(requests.length === 1 ? { success: true, task_id: id } : completed);
  });
  const accepted = await observe('generate', 'accepted', { topic: 'song', payload: body });
  assert.equal(accepted.payload, id);
  assert.equal(accepted.aceService, 'suno');
  const output = await observe('task', 'tracks', accepted);
  assert.equal(output.topic, 'song');
  assert.deepEqual(output.payload, { id, state: 'complete', tracks: [
    { id: song.id, title: song.title, url: audio, state: 'succeeded', duration: song.duration }
  ] });
  assert.deepEqual(requests.map(({ url, options }) => [url, JSON.parse(options.body)]), [
    ['https://api.acedata.cloud/suno/audios', { ...body, async: true }],
    ['https://api.acedata.cloud/suno/tasks', { action: 'retrieve', id }]
  ]);
  for (const { options } of requests) {
    assert.equal(options.headers.Authorization, 'Bearer fixture-token');
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
  }
  assert.ok(!JSON.stringify(output).includes('fixture-token'));
});

test('sends an available preview to progress while the task is pending', async t => {
  await load();
  t.mock.method(globalThis, 'fetch', async () => Response.json({
    id, response: { success: true, task_id: id, state: 'pending', data: [song, { state: 'pending' }] }
  }));
  const output = await observe('task', 'progress', { payload: id });
  assert.equal(output.payload.state, 'pending');
  assert.equal(output.payload.tracks[0].url, audio);
});

test('routes a completed task without a usable HTTPS track to the second port', async t => {
  await load();
  t.mock.method(globalThis, 'fetch', async () => Response.json({
    id, response: { success: true, task_id: id, state: 'complete', data: [{ audio_url: 'https://a:b@example.org/song' }] }
  }));
  const output = await observe('task', 'progress', { payload: id });
  assert.deepEqual(output.payload, { id, state: 'complete', tracks: [] });
});

for (const [label, fixture, expected] of [
  ['missing task', {}, /No matching Suno task/],
  ['task identity mismatch', { id, response: { task_id: 'other-task' } }, /does not match/],
  ['failed task', { id, response: { task_id: id, success: false } }, /did not complete successfully/]
]) {
  test(label + ' reaches Catch', async t => {
    await load();
    t.mock.method(globalThis, 'fetch', async () => Response.json(fixture));
    const output = await observe('task', 'errors', { payload: id });
    assert.match(output.error.message, expected);
  });
}

test('rejects a task for another provider before making a request', async t => {
  await load();
  const fetch = t.mock.method(globalThis, 'fetch');
  const output = await observe('task', 'errors', { payload: id, aceService: 'acemusic' });
  assert.match(output.error.message, /created by Suno/);
  assert.equal(fetch.mock.callCount(), 0);
});

test('rejects a missing credential before making a request', async t => {
  await load('');
  const fetch = t.mock.method(globalThis, 'fetch');
  const output = await observe('generate', 'errors', { payload: { prompt: 'A song' } });
  assert.match(output.error.message, /application token/);
  assert.equal(fetch.mock.callCount(), 0);
});

test('reports rate limits without automatically resubmitting a billable request', async t => {
  await load();
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 429 }));
  const output = await observe('generate', 'errors', { payload: { prompt: 'A song' } });
  assert.match(output.error.message, /HTTP 429/);
  assert.equal(fetch.mock.callCount(), 1);
  assert.ok(!JSON.stringify(output).includes('fixture-token'));
});
