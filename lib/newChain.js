"use strict";

var _ = require('lodash');
var chain_expert = require('dapple-utils/chain_expert.js')
var Web3Factory = require('dapple-utils/web3Factory.js');
var inquirer = require('inquirer');

module.exports = function(name, state, callback) {
  var configNewConnection = () => {
    var conn = {};
    return inquirer.prompt([
      {
        type: 'input',
        name: 'host',
        message: "Host",
      default: "localhost"
      },
      {
        type: 'input',
        name: 'port',
        message: 'Port',
      default: '8545'
      }
    ]).then((res) => {
      return new Promise(function(resolve, reject) {
        Web3Factory.JSONRPC({web3: res}, (err, web3) => {
          chain_expert.analyze(web3, (err, type) => {
            if(err) return reject(err);
            res.type = type;
            return resolve(res);
          });
        });
      });
    }).then((res) => {
      console.log(`Found a ${res.type} chain at ${res.host}:${res.port} !`);
      conn = res;
      return inquirer
      .prompt([{
        type: "confirm",
        name: "global",
        message: "Do you want to save this chain connection globally?"
      }]);
    }).then((res) => {
      if(res.global) {
        return new Promise((resolve, reject) => {
          state.addNetwork(name, conn, (err, res) => {
            if(err) return reject(err);
            return resolve();
          });
        });
      } else {
        return null;
      }
    }).then((res) => {
      return conn;
    });
  }

  // 1. choose chain connection/ network from known list or new
  // 1.1 internal => choose
  // 1.2 new =>
  // 1.2.1 ask for host and port
  // 1.2.2 check client
  // 1.2.2.1 testrpc => configure testrpc environment
  // 1.2.2.2 other => check chain type
  // 1.2.2.2.1 save if unknown, choose
  // 1.3 known => choose

  state.getJSON('networks', (err, networks) => {
    if(name in networks) {
      console.log(`WARN: Network "${name}" already known!`);
      // throw new Error(`Name "${name}" already associated with a network.`);
    }

    var nws = _.map(networks, (network, name) => ({
      name: `${name} -- ${network.type} @ ${network.host}:${network.port}`,
      value: name,
      short: name
    }));

    inquirer
    .prompt([{
      type: "list",
      name: "chain",
      message: "Select chain connection",
      choices: ['new', 'internal'].concat(nws)
    }]).then((res) => {
      if(res.chain === 'new') {
        return configNewConnection();
      } else if(res.chain === 'internal') {
        return "internal";
      } else {
        var conn = networks[res.chain];
        return new Promise((resolve, reject) => {
          Web3Factory.JSONRPC({web3: conn}, (err, web3) => {
            if( web3.isConnected() ) {

              chain_expert.analyze(web3, (err, type) => {
                if(err) return reject(err);
                if(type !== conn.type) {
                  console.log(`Error: network type mismatch! got ${type} but expected ${conn.type}.`);
                  return reject(null);
                }
                return resolve(res);
              });
            } else {
              reject(err);
            }
          });
        });
      }
    }).then((conn) => {
      return new Promise((resolve, reject) => {
        Web3Factory.JSONRPC({web3: conn}, (err, web3) => {
          web3.eth.getAccounts((err, res) => {
            if(err) return reject(err);
            return resolve(res);
          });
        });
      }).then(accounts => {
        return inquirer.prompt([{
          type: "list",
          name: "account",
          message: "default account:",
          choices: accounts
        }]);
      }).then(account => {
        conn.defaultAccount = account.account;
        callback(null, conn);
      });
    }).catch((err) => {
      console.log('Err',err);
    });
  });
}
