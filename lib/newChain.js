"use strict";

var _ = require('lodash');
var chain_expert = require('./chain_expert.js')
var Web3 = require('web3');
var inquirer = require('inquirer');
var clc = require('cli-color');

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
        var web3 = new Web3(new Web3.providers.HttpProvider(`http://${res.host}:${res.port}`));
        chain_expert.analyze(web3, (err, type) => {
          if(err) return reject(err);
          res.type = type;
          return resolve(res);
        });
      });
    }).then((res) => {
      console.log(`Found a ${clc.bold(res.type)} chain at ${res.host}:${res.port} !`);
      conn = res;
      return inquirer
      .prompt([{
        type: "confirm",
        name: "global",
        message: "Do you want to save this chain connection globally?",
        default: false
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
    // Formatted networks for display
    var nws = _.map(networks, (network, name) => ({
      name: `${name} -- ${network.type} @ ${network.host}:${network.port}`,
      value: name,
      short: name
    }));

    var tasks = [{
      type: "list",
      name: "chain",
      message: "Select chain connection",
      choices: ['remote', 'internal', 'fork ETH', 'fork ETC', 'fork MORDEN'].concat(nws)
    }];

    if(!name) {
      tasks = [{
        type: "input",
        name: "name",
        message: "Chain name"
      }].concat(tasks);
    }

    inquirer
    .prompt(tasks)
    .then((res) => {
      if(res.name) {
        name = res.name;
      } else {
        res.name = name;
      }
      if(name === 'env') {
        console.log(clc.red('ERR')+` Environment name "env" is a reserved Keyword!`);
        process.exit();
      }
      if(res.chain === 'remote') {
        return configNewConnection()
        .then((conn) => {
          new Promise((resolve, reject) => {
            var web3 = new Web3(new Web3.providers.HttpProvider(`http://${conn.host}:${conn.port}`));
            web3.eth.getAccounts((err, res) => {
              if(err) return reject(err);
              return resolve(res);
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
            conn.name = name;
            callback(null, conn);
          });
        });
      } else if(res.chain === 'fork ETH') {
        state.forkLiveChain(name, 'ETH', callback);
      } else if(res.chain === 'fork ETC') {
        state.forkLiveChain(name, 'ETC', callback);
      } else if(res.chain === 'fork MORDEN') {
        state.forkLiveChain(name, 'MORDEN', callback);
      } else if(res.chain === 'internal') {
        state.createChain(name);
        return callback(null, "internal");
      } else {
        var conn = networks[res.chain];
        return new Promise((resolve, reject) => {
          var web3 = new Web3(new Web3.providers.HttpProvider(`http://${conn.host}:${conn.port}`));
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
      }
    }).catch((err) => {
      console.log('Err',err);
      callback(err);
    });
  });
}
