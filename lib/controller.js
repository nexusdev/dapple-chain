"use strict";

/*
 * DAPPLE CONTROLLER - standalone command line handler for dapple chain
 *
 */
var DappleChain = require('./blockchain.js');
var Formatters = require('./formatters.js');
var Server = require('./server.js');
var inquirer = require('inquirer');
var newChain = require('./newChain.js');
var _ = require('lodash');
var toHex = require('./utils.js').toHex;

// TODO - export a lot of this into dapple-core
module.exports = {

  cli: function (cli, workspace, state) {

    if(cli.server) {
      this.server(cli, workspace);
    } else {
      if(cli.status) {
        this.status(state);
      } else if(cli.list) {
        this.list(state);
      } else if(cli.fork) {
        this.fork(state, cli);
      } else if(cli.checkout) {
        this.checkout(state, cli);
      } else if(cli.log) {
        this.log(state);
      } else if(cli.fake) {
        this.fake(state, cli);
      } else if(cli.new) {
        this.new(state, cli, state);
      }
    }
  },

  // Create a new environment
  new: function (state, cli) {

    var name = cli['<name>'];

    var chains = Object.keys(state.state.pointers);

    if(chains.indexOf(name) > -1) {
      console.log(`Error: Chain ${name} is already known, please choose another name.`);
      process.exit();
    }

    newChain(name, state, (err, conn) => {
      // TODO - if ETH ask weather user want to fork the current head
      if(typeof conn === 'string') return true;
      console.log(conn);
      state.state.pointers[conn.name] = {
        branch: false,
        env: {},
        network: {
          host: conn.host,
          port: conn.port
        },
        type: conn.type,
        defaultAccount: conn.defaultAccount,
        devmode: false,
        confirmationBlocks: conn.type === 'TestRPC'?0:1
      };
      state.state.head = conn.name;
      state.saveState(true);
    });

  },

  // Print out all branches and relevant minimal informations
  list: function (state) {
    console.log(Formatters.list(state.state));
  },

  // fork an existing branch
  fork: function (state, cli) {
    this.assertInternal(state);

    let name = cli['<name>'];

    if(name in state.state.pointers) throw new Error(`Branch "${name}" already exists`);
    state.state.pointers[name] = state.state.pointers[state.state.head];
    console.log(`Forked ${state.state.head} to ${name}`);
    state.state.head = name;
    state.saveState(true);
  },

  // checkout an existing branch
  checkout: function (state, cli) {
    let name = cli['<name>'];
    if(!name in state.state.pointers) throw new Error(`No branch with name "${name}"`);
    state.state.head = name;
    state.saveState(true);
    console.log(`switched to ${name}`);
  },

  // log relevant information
  log: function (state) {
    this.assertInternal(state);
    state.chain.log();
  },

  // start an rpc server
  server: function (cli, workspace) {
    this.assertInternal(state);
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

  fake: function (state, cli) {
    this.assertInternal(state);
    var address = cli['<address>'];

    address = toHex(address).toLocaleLowerCase();
    var chainenv = state.state.pointers[state.state.head];
    if(chainenv.fakedOwnership.indexOf(address) == -1) {
      chainenv.fakedOwnership.push(address);
    }
    chainenv.defaultAccount = address;
    state.saveState(true);

  },

  assertInternal: (state) => {
    var chainenv = state.state.pointers[state.state.head];
    if(chainenv.type !== 'internal') {
      console.log('This is only allowed on internal environments!');
      process.exit();
    }
  }

};
