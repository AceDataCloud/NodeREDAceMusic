'use strict';

const terminalSuccess = new Set(['complete', 'completed', 'succeeded']);
const terminalFailure = new Set(['failed', 'failure', 'error', 'cancelled', 'canceled']);

function inputHandler(RED, node, config, handle) {
  RED.nodes.createNode(node, config);
  node.on('input', async (msg, send, done) => {
    try {
      const token = RED.nodes.getNode(config.account)?.credentials?.token?.trim();
      if (!token) throw new Error('Configure an application token with access to Suno.');
      await handle(msg, send, token);
      done();
    } catch (error) {
      done(error);
    }
  });
}

async function post(path, body, token) {
  const response = await fetch('https://api.acedata.cloud/suno/' + path, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(30000),
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error('Suno returned HTTP ' + response.status + '.');
  return response.json();
}

function track(item) {
  if (typeof item?.audio_url !== 'string' || !URL.canParse(item.audio_url)) return null;
  const audio = new URL(item.audio_url);
  if (audio.protocol !== 'https:' || audio.username || audio.password) return null;
  return { id: item.id, title: item.title, url: audio.href, state: item.state, duration: item.duration };
}

function taskResult(record, id) {
  if (!record || !Object.keys(record).length) throw new Error('No matching Suno task was found.');
  const response = record.response;
  if (record.id !== id || (response?.task_id != null && response.task_id !== id)) {
    throw new Error('The task ID in the response does not match the requested ID.');
  }
  const state = response?.state || response?.status || record.state || record.status;
  if (response?.success === false || terminalFailure.has(state)) {
    throw new Error('The Suno task did not complete successfully. Check the original task in application history.');
  }
  const items = Array.isArray(response?.data) ? response.data : [];
  const tracks = items.map(track).filter(Boolean);
  const allTracksComplete = items.length > 0 && items.every(item => terminalSuccess.has(item?.state));
  const completed = response?.success === true && (terminalSuccess.has(state) || (!state && allTracksComplete));
  return { id, state: completed ? 'complete' : (state || 'pending'), tracks, completed };
}

module.exports = { inputHandler, post, taskResult };
