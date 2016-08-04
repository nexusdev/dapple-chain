"use strict";

/*
 * DAPPLE CONTROLLER - standalone command line handler for dapple chain
 *
 */
var DappleChain = require('./blockchain.js');
var Formatters = require('./formatters.js');
var Server = require('./server.js');
var inquirer = require('inquirer');
var Web3Factory = require('dapple-utils/web3Factory.js');
var chain_expert = require('dapple-utils/chain_expert.js')
var newChain = require('./newChain.js');
var _ = require('lodash');

module.exports = {

  cli: function (cli, workspace, state) {

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
      } else if(cli.fake) {
        this.fake(dapplechain, cli);
      } else if(cli.new) {
        this.new(dapplechain, cli, state);
      }
    }
  },

  // Create a new environment
  new: function (dapplechain, cli, state) {

    // TODO - check wether name is already taken
    //      - test environments as well
    var name = cli['<name>'];
    newChain(name, state, (err, conn) => {
      console.log(conn);
    });

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
  },

  fake: function (dapplechain, cli) {
    dapplechain.addFakedOwnership(cli['<address>']);
  }

};
