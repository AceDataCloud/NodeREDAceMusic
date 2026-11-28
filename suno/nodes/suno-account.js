'use strict';

module.exports = function register(RED) {
  function SunoAccount(config) {
    RED.nodes.createNode(this, config);
  }
  RED.nodes.registerType('acedatacloud-suno-account', SunoAccount, {
    credentials: { token: { type: 'password' } }
  });
};
