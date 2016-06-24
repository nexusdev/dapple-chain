var Server = require('./server.js');
var Manager = require('./manager.js');
var Controller = require('./controller.js');
var cliSpec = require('../spec/cli.json');

DappleChain = {

  Manager: Manager,

  controller: Controller,
  cliSpec: cliSpec,
  name: "chain",

  web3Provider: function(opts) {

    var provider = Server.provider(opts || {});
    // Add basic account to client, so it can sign transactions
    // TODO - fake ownership of 0x9ae2d2bbf1f3bf003a671fe212236089b45609ac
    // dapple chain fake 0x0000..00
    provider.manager.blockchain.addFakedOwnership('0x0000000000000000000000000000000000000000');

    return provider;
  }
}

module.exports = DappleChain;
