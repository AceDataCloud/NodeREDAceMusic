'use strict';

const { inputHandler, post } = require('../lib/suno');

module.exports = function register(RED) {
  function Generate(config) {
    inputHandler(RED, this, config, async (msg, send, token) => {
      const body = msg.payload;
      if (Object.prototype.toString.call(body) !== '[object Object]' || !Object.keys(body).length) {
        throw new Error('Set msg.payload to a Suno audio request object.');
      }
      if (body.stream === true) throw new Error('Use an asynchronous request with streaming disabled.');
      const result = await post('audios', { ...body, async: true }, token);
      if (result?.success === false || typeof result?.task_id !== 'string' || !result.task_id.trim()) {
        throw new Error('Suno did not return a task ID. Check application history before resubmitting.');
      }
      msg.payload = result.task_id;
      msg.aceService = 'suno';
      send(msg);
    });
  }
  RED.nodes.registerType('acedatacloud-suno-generate', Generate);
};
