"use strict";

/*
 * DAPPLE CONTROLLER - standalone command line handler for dapple chain
 *
 */
var Formatters = require('./formatters.js');
var Server = require('./server.js');
var inquirer = require('inquirer');
var _ = require('lodash');
var toHex = require('./utils.js').toHex;
var restore = require('./restore.js');

// TODO - export a lot of this into dapple-core
module.exports = {

  cli: function (state, cli) {

    if(cli.server) {
      this.server(cli, state);
    } else {
      if(cli.ls) {
        this.list(state);
      } else if(cli.rm) {
        this.remove(cli, state);
      } else if(cli.fork) {
        this.fork(state, cli);
      } else if(cli.checkout) {
        this.checkout(state, cli);
      } else if(cli.log) {
        this.log(state);
      } else if(cli.fake) {
        this.fake(state, cli);
      } else if(cli.restore) {
        this.restore(cli, state);
      }
    }
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
  // log: function (state) {
  //   this.assertInternal(state);
  //   state.chain.log();
  // },

  // start an rpc server
  server: function (cli, state) {
    this.assertInternal(state);
    var options = {
      port: 8545,
      logger: console,
      packageRoot: state.workspace.package_root,
      state
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
  },

  restore: (cli, state) => {
    restore(cli, state);
  },

  remove: (cli, state) => {
    let name = cli['<name>'];
    if(!(name in state.state.pointers)) {
      console.log(`Chain name "${name} is not known!`);
      return null;
    }
    if(Object.keys(state.state.pointers).length === 1) {
      console.log(`Cannot remove last chain, please add an alternative before removing it!`);
      return null;
    }
    delete state.state.pointers[name];
    if(state.state.head === name) state.state.head = Object.keys(state.state.pointers)[0];
    state.saveState(true);
  }

};
