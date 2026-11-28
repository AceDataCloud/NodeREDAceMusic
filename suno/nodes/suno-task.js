'use strict';

const { inputHandler, post, taskResult } = require('../lib/suno');

module.exports = function register(RED) {
  function Task(config) {
    inputHandler(RED, this, config, async (msg, send, token) => {
      const id = typeof msg.payload === 'string' ? msg.payload.trim() : '';
      if (!id) throw new Error('Set msg.payload to an existing Suno task ID.');
      if (msg.aceService && msg.aceService !== 'suno') throw new Error('Select a task created by Suno.');
      const { completed, ...payload } = taskResult(await post('tasks', { action: 'retrieve', id }, token), id);
      msg.payload = payload;
      msg.aceService = 'suno';
      send(completed && payload.tracks.length ? [msg, null] : [null, msg]);
    });
  }
  RED.nodes.registerType('acedatacloud-suno-task', Task);
};
