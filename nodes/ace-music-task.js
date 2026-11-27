'use strict';

function audioTrack(item) {
  if (typeof item?.audio_url !== 'string') return null;
  let url;
  try {
    url = new URL(item.audio_url);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  return { id: item.id, title: item.title, url: url.href };
}

module.exports = function register(RED) {
  function AceMusicTask(config) {
    RED.nodes.createNode(this, config);
    this.on('input', async (msg, send, done) => {
      try {
        const id = typeof msg.payload === 'string' ? msg.payload.trim() : '';
        if (!id) throw new Error('Provide the existing ACE Music task ID in msg.payload.');
        const token = this.credentials?.token?.trim();
        if (!token) throw new Error('Configure an ACE Music application token in the node.');
        const response = await fetch('https://api.acedata.cloud/acemusic/tasks', {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(15000),
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'retrieve', id })
        });
        if (!response.ok) throw new Error('ACE Music task lookup returned HTTP ' + response.status + '.');
        const result = await response.json();
        if (result && Object.keys(result).length === 0) throw new Error('No matching ACE Music task was found.');
        const group = result?.response;
        if (result?.id !== id || (group?.task_id != null && group.task_id !== id)) {
          throw new Error('The task ID in the response does not match the requested ID.');
        }
        const tracks = Array.isArray(group?.data) ? group.data.map(audioTrack).filter(Boolean) : [];
        msg.payload = {
          id, state: group?.status || result.status || result.state || 'unknown', tracks
        };
        send(tracks.length ? [msg, null] : [null, msg]);
        done();
      } catch (error) {
        done(error);
      }
    });
  }
  RED.nodes.registerType('ace-music-task', AceMusicTask, {
    credentials: { token: { type: 'password' } }
  });
};
