"use strict";

var _ = require('lodash');
var chain_expert = require('./chain_expert.js')
var Web3 = require('web3');
var inquirer = require('inquirer');
var clc = require('cli-color');
var utils = require('./utils.js');

module.exports = function(obj, state, callback) {

  var configNewConnection = (name) => {
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
          console.log(`Found a ${clc.bold(type)} chain at ${res.host}:${res.port} !`);
          if(err) return reject(err);
          res.type = type;
          return resolve(res);
        });
      });
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
      name: `${name} -- ${network.type} @ ${network.network.host}:${network.network.port}`,
      value: name,
      short: name
    }));

    var tasks = [{
      type: "list",
      name: "chain",
      message: "Select chain type",
      choices: ['remote rpc', 'internal', 'fork ETH', 'fork ETC', 'fork MORDEN'].concat(nws)
    }];

    var name = obj.name;
    if(!name) {
      tasks = [{
        type: "input",
        name: "name",
        message: "Chain name"
      }].concat(tasks);
    }

    var reserved = "break case const continue default delete do else for if in mapping new private public return returns struct switch this var while constant internal modifier suicide true false wei szabo finney ether seconds minutes hours days weeks years now mapping real string text msg block tx ureal address bool bytes int int8 int16 int24 int32 int40 int48 int56 int64 int72 int80 int88 int96 int104 int112 int120 int128 int136 int144 int152 int160 int168 int178 int184 int192 int200 int208 int216 int224 int232 int240 int248 int256 uint uint8 uint16 uint24 uint32 uint40 uint48 uint56 uint64 uint72 uint80 uint88 uint96 uint104 uint112 uint120 uint128 uint136 uint144 uint152 uint160 uint168 uint178 uint184 uint192 uint200 uint208 uint216 uint224 uint232 uint240 uint248 uint256 hash hash8 hash16 hash24 hash32 hash40 hash48 hash56 hash64 hash72 hash80 hash88 hash96 hash104 hash112 hash120 hash128 hash136 hash144 hash152 hash160 hash168 hash178 hash184 hash192 hash200 hash208 hash216 hash224 hash232 hash240 hash248 hash256 string1 string2 string3 string4 string5 string6 string7 string8 string9 string10 string11 string12 string13 string14 string15 string16 string17 string18 string19 string20 string21 string22 string23 string24 string25 string26 string27 string28 string29 string30 string31 string32 bytes1 bytes2 bytes3 bytes4 bytes5 bytes6 bytes7 bytes8 bytes9 bytes10 bytes11 bytes12 bytes13 bytes14 bytes15 bytes16 bytes17 bytes18 bytes19 bytes20 bytes21 bytes22 bytes23 bytes24 bytes25 bytes26 bytes27 bytes28 bytes29 bytes30 bytes31 bytes32";

    inquirer
    .prompt(tasks)
    .then((res) => {
      if(res.name) {
        name = res.name;
      } else {
        res.name = name;
      }
      if(!/^[a-zA-Z0-9]+$/.test(name) || (new RegExp('^(' + reserved.split(' ').join('|') + ')$').test(name))) {
        console.log(clc.red('ERR')+` Environment name "${name}" is invalid or a reserved Keyword!`);
        process.exit();
      }
      if(res.chain === 'remote rpc') {
        return configNewConnection(name)
        .then((conn) => {
          var result;
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
            var chainenv = {
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
            }
            return {name, chainenv};
          }).then((res) => {
            result = res;
            return inquirer
            .prompt([{
              type: "confirm",
              name: "global",
              message: "Do you want to save this chain connection globally?",
            default: false
            }]);
          }).then((res) => {
            if(res.global) {
              state.addNetwork(result, (err, res) => {
                if(err) return callback(err);
                callback(null, result);
              });
            } else {
              callback(null, result);
            }
          });
        });
      } else if(res.chain === 'fork ETH') {
        utils.forkLiveChain(state.db, 'ETH', (err, chainenv) => {callback(err, {name, chainenv})});
      } else if(res.chain === 'fork ETC') {
        utils.forkLiveChain(state.db, 'ETC', (err, chainenv) => {callback(err, {name, chainenv})});
      } else if(res.chain === 'fork MORDEN') {
        utils.forkLiveChain(state.db, 'MORDEN', (err, chainenv) => {callback(err, {name, chainenv})});
      } else if(res.chain === 'internal') {
        state.createChain(name);
        return callback(null, "internal");
      } else {
        var conn = networks[res.chain];
        callback(null, {name, chainenv:conn});
        // return conn;
        // return new Promise((resolve, reject) => {
        //   var web3 = new Web3(new Web3.providers.HttpProvider(`http://${conn.host}:${conn.port}`));
        //   if( web3.isConnected() ) {
        //
        //     chain_expert.analyze(web3, (err, type) => {
        //       if(err) return reject(err);
        //       if(type !== conn.type) {
        //         console.log(`Error: network type mismatch! got ${type} but expected ${conn.type}.`);
        //         return reject(null);
        //       }
        //       return resolve(res);
        //     });
        //   } else {
        //     reject(err);
        //   }
        // });
      }
    }).catch((err) => {
      console.log('Err',err);
      callback(err);
    });
  });
}
