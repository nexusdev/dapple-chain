"use strict";

/*
 * DAPPLE CONTROLLER - standalone command line handler for dapple chain
 *
 */
var DappleChain = require('./blockchain.js');
var Formatters = require('./formatters.js');
var Server = require('./server.js');

module.exports = {

  cli: function (cli, workspace) {

    if(cli.server) {
      this.server(cli, workspace);
    } else {
      // setup dapplechain
      var dapplechain = new DappleChain({
        packageRoot: workspace.package_root
      }, {});

      if(cli.status) {
        this.status(dapplechain);
      } else if(cli.branch) {
        this.branch(dapplechain);
      } else if(cli.fork) {
        this.fork(dapplechain, cli);
      } else if(cli.checkout) {
        this.checkout(dapplechain, cli);
      } else if(cli.log) {
        this.log(dapplechain);
      }
    }
  },

  // Print out the status of the current head
  status: function (dapplechain) {
    console.log(Formatters.status(dapplechain.state));
  },

  // Print out all branches and relevant minimal informations
  branch: function (dapplechain) {
    console.log(Formatters.branch(dapplechain.state));
  },

  // fork an existing branch
  fork: function (dapplechain, cli) {
    dapplechain.fork(cli['<name>']);
  },

  // checkout an existing branch
  checkout: function (dapplechain, cli) {
    dapplechain.checkout(cli['<name>']);
  },

  // log relevant information
  log: function (dapplechain) {
    dapplechain.log();
  },

  // start an rpc server
  server: function (cli, workspace) {
    var options = {
      port: 8545,
      logger: console,
      packageRoot: workspace.package_root
    }
    var server = Server.server.apply(Server, [options]);
    server.listen(8545, (err, blockchain) => {
      console.log(`open on 8545`);
    });
  }

};
