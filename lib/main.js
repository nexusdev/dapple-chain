var Provider = require('./provider.js');
var Manager = require('./manager.js');
var Controller = require('./controller.js');
var cliSpec = require('../spec/cli.json');
var argv = require('yargs').argv;

InitObject = function() {
  // this.manager  = new Manager();
  this.provider = new Provider(this.manager);

  return this;
}

InitObject.prototype.createAccounts = function(num, cb) { this.manager.createAccounts(num, cb); }
InitObject.prototype.setBalance= function(address, balance, callback) { this.manager.ethersim_setBalance(address, balance, callback); }
InitObject.prototype.mine = function() { this.manager.mine();  }
InitObject.prototype.reset= function() { this.manager.reset(); }
InitObject.prototype.jump = function(seconds) { this.manager.jump(seconds);  }

DappleChain = {

  Provider: Provider,
  Manager: Manager,

  init: InitObject,
  controller: Controller,
  cliSpec: cliSpec,
  name: "chain",

  web3Provider: function(opts) {

    var manager  = new this.Manager(opts || {});
    // Add basic account to client, so it can sign transactions
    manager.blockchain.addAccount({
      secretKey: "0x814014feae0786284cc9dda43b231536c23f0f51c1febe530a5a0d10e5d40042"
    });
    var provider = new this.Provider(manager);

    return provider;
  }
}

module.exports = DappleChain;
