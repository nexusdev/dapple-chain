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
    // provider.manager.blockchain.addAccount({
    //   secretKey: "0x814014feae0786284cc9dda43b231536c23f0f51c1febe530a5a0d10e5d40042"
    // });
    // provider.manager.blockchain.addFakedOwnership('0x9ae2d2bbf1f3bf003a671fe212236089b45609ac');
    //
    // dapple chain fake 0x0000..00
    provider.manager.blockchain.addFakedOwnership('0x3282791d6fd713f1e94f4bfd565eaa78b3a0599d');

    return provider;
  }
}

module.exports = DappleChain;
