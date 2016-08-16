var Server = require('./server.js');
var Manager = require('./manager.js');
var Controller = require('./controller.js');
var cliSpec = require('../spec/cli.json');
var createNewChain = require('./createNewChain.js');
var utils = require('./utils.js');

DappleChain = {

  Manager: Manager,

  controller: Controller,
  cliSpec: cliSpec,
  name: "chain",

  web3Provider: function(opts) {

    var provider = Server.provider(opts || {});

    return provider;
  },
  createNewChain: createNewChain,
  initNew: utils.initNew,
  forkLiveChain: utils.forkLiveChain
}

module.exports = DappleChain;
