'use strict';

const { after, afterEach, before, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const helper = require('node-red-node-test-helper');
const task = require('../nodes/ace-music-task');

helper.init(require.resolve('node-red'));
before(() => helper.startServer());
after(() => helper.stopServer());
beforeEach(() => helper.load(task, [
  { id: 'tab', type: 'tab', label: 'ACE Music tests' },
  { id: 'task', z: 'tab', x: 100, y: 100, type: 'ace-music-task', wires: [['audio'], ['empty']] },
  { id: 'audio', z: 'tab', x: 100, y: 100, type: 'helper' },
  { id: 'empty', z: 'tab', x: 100, y: 100, type: 'helper' },
  { id: 'watcher', z: 'tab', x: 100, y: 100, type: 'catch', scope: ['task'], wires: [['errors']] },
  { id: 'errors', z: 'tab', x: 100, y: 100, type: 'helper' }
], { task: { token: 'fixture' } }));
afterEach(() => helper.unload());

function respond(t, data, status = 200) {
  return t.mock.method(globalThis, 'fetch', async () => Response.json(data, { status }));
}

async function observe(target, payload) {
  const event = once(helper.getNode(target), 'input', { signal: AbortSignal.timeout(3000) });
  helper.getNode('task').receive({ payload, topic: 'music-task' });
  return (await event)[0];
}

test('routes available tracks on a partial task and keeps the original message', async t => {
  const request = respond(t, {
    id: 'task-1', response: {
      task_id: 'task-1', status: 'partial_failed',
      data: [
        { id: 'a', title: 'Track one', audio_url: 'https://example.org/a.mp3?sig=example' },
        { id: 'b', audio_url: 'file:///local.mp3' }
      ]
    }
  });
  const result = await observe('audio', ' task-1 ');
  assert.deepEqual(result.payload, {
    id: 'task-1', state: 'partial_failed', tracks: [{ id: 'a', title: 'Track one', url: 'https://example.org/a.mp3?sig=example' }]
  });
  assert.equal(result.topic, 'music-task');
  const [url, options] = request.mock.calls[0].arguments;
  assert.equal(url, 'https://api.acedata.cloud/acemusic/tasks');
  assert.equal(options.headers.Authorization, 'Bearer fixture');
  assert.deepEqual(JSON.parse(options.body), { action: 'retrieve', id: 'task-1' });
});

test('routes a processing task to the empty output', async t => {
  respond(t, { id: 'task-1', state: 'processing' });
  assert.deepEqual((await observe('empty', 'task-1')).payload, {
    id: 'task-1', state: 'processing', tracks: []
  });
});

test('routes mismatched responses to the flow Catch node', async t => {
  respond(t, { id: 'task-1', response: { task_id: 'other' } });
  assert.match((await observe('errors', 'task-1')).error.message, /does not match/);
});

test('reports lookup authorization errors without copying the token to the message', async t => {
  respond(t, { error: 'invalid' }, 401);
  const result = await observe('errors', 'task-1');
  assert.match(result.error.message, /HTTP 401/);
  assert.ok(!JSON.stringify(result).includes('fixture'));
});
