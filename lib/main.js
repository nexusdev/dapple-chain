var Server = require('./server.js');
var Provider = require('./provider.js');
var Manager = require('./manager.js');
var Controller = require('./controller.js');
var cliSpec = require('../spec/cli.json');

DappleChain = {

  Provider: Provider,
  Manager: Manager,

  controller: Controller,
  cliSpec: cliSpec,
  name: "chain",

  web3Provider: function(opts) {

    var provider = Server.provider(opts || {});
    // Add basic account to client, so it can sign transactions
    provider.manager.blockchain.addAccount({
      secretKey: "0x814014feae0786284cc9dda43b231536c23f0f51c1febe530a5a0d10e5d40042"
    });

    return provider;
  }
}

module.exports = DappleChain;
