'use strict';

const services = new Map([
  ['suno',       { submit: '/suno/audios',               type: 'audio', url: 'audio_url' }],
  ['acemusic',   { submit: '/acemusic/audios',           type: 'audio', url: 'audio_url' }],
  ['nano-banana',{ submit: '/nano-banana/images',        type: 'image', url: 'image_url' }],
  ['openai',     { submit: '/openai/images/generations', type: 'image', url: 'url', base64: true }],
  ['seedream',   { submit: '/seedream/images',           type: 'image', url: 'image_url', base64: true }],
  ['flux',       { submit: '/flux/images',               type: 'image', url: 'image_url' }],
  ['seedance',   { submit: '/seedance/videos',           type: 'video', url: 'video_url' }],
  ['kling',      { submit: '/kling/videos',              type: 'video', url: 'video_url' }],
  ['veo',        { submit: '/veo/videos',                type: 'video', url: 'video_url' }],
  ['hailuo',     { submit: '/hailuo/videos',             type: 'video', url: 'video_url' }]
]);

function mediaService(key) {
  const spec = services.get(key);
  if (!spec) throw new Error('Select a supported media service in the node.');
  return spec;
}

function rowsFor(service, result) {
  if (service === 'seedance') return [result?.data?.content];
  if (service === 'kling') return [result];
  return Array.isArray(result?.data) ? result.data : [];
}

function readMedia(spec, rows) {
  const assets = [];
  for (const row of rows) {
    if (!row) continue;
    const source = row[spec.url];
    const url = typeof source === 'string' && URL.canParse(source) ? new URL(source) : null;
    if (url?.protocol === 'https:' && !url.username && !url.password) {
      assets.push({ type: spec.type, url: url.href });
    } else if (spec.base64 && typeof row.b64_json === 'string' && row.b64_json.length) {
      assets.push({ type: 'image', b64_json: row.b64_json });
    }
  }
  return assets;
}

function readState(record, rows) {
  const result = record.response;
  const state = result?.status || result?.state || result?.data?.status || record.status || record.state;
  if (state) return state;
  if (result?.success === false || result?.error) return 'failed';
  const states = new Set(rows.map(row => row?.state || row?.status).filter(Boolean));
  if (states.size === 1) return [...states][0];
  if (states.size > 1) return 'mixed';
  if (record.finished_at || result?.finished_at || result?.success === true) return 'completed';
  return 'pending';
}

async function post(path, body, token) {
  const response = await fetch('https://api.acedata.cloud' + path, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(30000),
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error('Ace Data Cloud returned HTTP ' + response.status + '.');
  return response.json();
}

module.exports = function register(RED) {
  function Account(config) {
    RED.nodes.createNode(this, config);
  }
  RED.nodes.registerType('acedatacloud-media-account', Account, {
    credentials: { token: { type: 'password' } }
  });

  function setup(node, config, handle) {
    RED.nodes.createNode(node, config);
    node.on('input', async (msg, send, done) => {
      try {
        const token = RED.nodes.getNode(config.account)?.credentials?.token?.trim();
        if (!token) throw new Error('Configure an Ace Data Cloud application token.');
        await handle(msg, send, token);
        done();
      } catch (error) {
        done(error);
      }
    });
  }

  function Generate(config) {
    setup(this, config, async (msg, send, token) => {
      const spec = mediaService(config.service);
      const body = msg.payload;
      if (Object.prototype.toString.call(body) !== '[object Object]' || !Object.keys(body).length) {
        throw new Error('Set msg.payload to the JSON request object for the selected generation API.');
      }
      if (body.stream === true) throw new Error('Use an asynchronous generation request with streaming disabled.');
      const result = await post(spec.submit, { ...body, async: true }, token);
      if (result?.success === false || typeof result?.task_id !== 'string' || !result.task_id.trim()) {
        throw new Error('Generation did not return a task ID. Check the application history before resubmitting.');
      }
      msg.payload = result.task_id;
      msg.aceService = config.service;
      send(msg);
    });
  }
  RED.nodes.registerType('acedatacloud-media-generate', Generate);

  function Task(config) {
    setup(this, config, async (msg, send, token) => {
      const spec = mediaService(config.service);
      const id = typeof msg.payload === 'string' ? msg.payload.trim() : '';
      if (!id) throw new Error('Set msg.payload to the existing task ID.');
      if (msg.aceService && msg.aceService !== config.service) {
        throw new Error('Select the same service that created this task.');
      }
      const record = await post('/' + config.service + '/tasks', { action: 'retrieve', id }, token);
      if (!record || !Object.keys(record).length) throw new Error('No matching task was found.');
      if (record.id !== id || (record.response?.task_id != null && record.response.task_id !== id)) {
        throw new Error('The task ID in the response does not match the requested ID.');
      }
      const rows = rowsFor(config.service, record.response);
      const assets = readMedia(spec, rows);
      msg.aceService = config.service;
      msg.payload = { id, service: config.service, state: readState(record, rows), assets };
      send(assets.length ? [msg, null] : [null, msg]);
    });
  }
  RED.nodes.registerType('acedatacloud-media-task', Task);

  function ImageSearch(config) {
    setup(this, config, async (msg, send, token) => {
      const query = typeof msg.payload === 'string' ? msg.payload.trim() : '';
      if (!query) throw new Error('Set msg.payload to the image search query.');
      const body = { query, type: 'images' };
      if (config.imageSize) body.image_size = config.imageSize;
      const result = await post('/serp/google', body, token);
      if (!Array.isArray(result?.images)) throw new Error('Image search did not return an images array.');
      msg.payload = result.images;
      msg.aceService = 'serp';
      send(msg);
    });
  }
  RED.nodes.registerType('acedatacloud-image-search', ImageSearch);
};
