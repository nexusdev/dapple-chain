"use strict";
var Account = require('ethereumjs-account');
var Block = require('ethereumjs-block');
var crypto = require('crypto');
var optionalCallback = require('./utils.js').optionalCallback;
var toHex = require('./utils.js').toHex;
var VM = require('ethereumjs-vm');
var Blockchain = require('ethereumjs-blockchain');
var Trie = require('merkle-patricia-tree/secure');
var Transaction = require('ethereumjs-tx');
var FakeTransaction = require('ethereumjs-tx/fake.js');
var utils = require('ethereumjs-util');
var path = require('path');
var deasync = require('deasync');
var async = require('async');
var common = require('ethereum-common');
var BigNumber = require('bignumber.js');
var rlp = require('rlp');
var GethInterface = require('./gethInterface.js');
var DapphubInterface = require('./dapphubInterface.js');
var fs = require('fs');
var to = require('ethereumjs-testrpc/lib/utils/to');
var tmp = require('tmp');
// var stdin = process.openStdin();
// stdin.setRawMode( true );
// // resume stdin in the parent process (node app won't quit all by itself
// // unless an error or process.exit() happens)
// stdin.resume();
//
// // i don't want binary, do you?
// stdin.setEncoding( 'utf8' );

// TODO - refactor this out of dapplechain
var Formatters = require('./formatters.js');

/* Dapple-Chain Blockchain
 *
 * @param opts options object
 *
 */
var DappleChain = function(opts, cb) {
  this._initDone = false;

  // TODO - parametarize dapphub in chain and address
  this.db = opts.db
  this.chainenv = opts.chainenv;
  if(typeof opts.chainenv.network === 'string') {
    this.dhInterface = new DapphubInterface(opts.chainenv.network);
    this.dhInterface.initDb(this.db);
  }
  this.stateTrie = new Trie(this.db);
  this.stateTrie.root = new Buffer(this.chainenv.stateRoot.slice(2), 'hex');
  this.mode = opts.mode || 'persistent'; // persistent, temporary
  this.accounts = {};
  this.coinbase = null;
  this.contracts = {};
  this.blockHashes = {};
  this.transactions = {};
  this.latest_filter_id = 1;
  this.transaction_queue = [];
  this.transaction_processing == false;
  // this.parentBlock = null;
  this.snapshots = [];
  this.logger = console;
  this.time_difference = 0;
  this.ds = opts.ds || {};
  if(opts.VM) {
    this.vm = new opts.VM({
      state: this.stateTrie,
      enableHomestead: true
    });
  } else {
    this.vm = new VM({
      state: this.stateTrie,
      enableHomestead: true
    });
  }

//   this.vm.on('step', function (data) {
//     var format = (what) => {
//       var _tmp = what.map(m => toHex(m).slice(2)).map(m => m.length ==0? '00': m);
//       return _tmp.map( (m,i) => i%32 == 0 ? '\n'+m : (i%2==0? ' '+m: m) ).join('');
//     }
//     console.log(`\n`);
//     console.log(`ADDRESS: ${data.address.toString("hex")}`);
//     console.log(`${data.opcode.name} PC: ${data.pc}`);
//     console.log(`STACK: \n${data.stack.map(s=>s.toString("hex")).map(s=>s.length==0?"0x00":"0x"+s).reverse().map((s,i)=>i+" "+s).join('\n')}`);
//     console.log(`MEMORY: \n`, format(data.memory));
//  })

  // this.vm.on('step', function (data, cb) {
  //   var format = (what) => {
  //     var _tmp = what.map(m => toHex(m).slice(2)).map(m => m.length ==0? '00': m);
  //     return _tmp.map( (m,i) => i%32 == 0 ? '\n'+m : (i%2==0? ' '+m: m) ).join('');
  //   }
  //   console.log(`${data.opcode.name} ${data.stack.slice(0,data.opcode.in).map(v => '0x'+v.toString("hex")).revert().join(' ')}`); // on any data into stdin
  //   var handleKey = function( key ){
  //     // ctrl-c ( end of text )
  //     if ( key === '\u0003' ) {
  //       process.exit();
  //     }
  //     switch (key) {
  //       case 's':
  //         console.log(`STACK: \n${data.stack.map(s=>s.toString("hex")).map(s=>s.length==0?"0x00":"0x"+s).reverse().map((s,i)=>i+" "+s).join('\n')}`);
  //         break;
  //       case 'm':
  //         console.log(`MEMORY: \n`, format(data.memory));
  //         break;
  //       case 'n':
  //         stdin.removeListener("data", handleKey);
  //         cb();
  //         break;
  //       case 'a':
  //         console.log(`ADDRESS: ${data.address.toString("hex")}`);
  //         break;
  //       default:
  //         stdin.removeListener("data", handleKey);
  //         cb();
  //     }
  //   };
//
    // stdin.on('data', handleKey);
//  })

  async.waterfall([
    // this.loadState.bind(this),
    ((cb) => {
      var _get = this.db.get
      var self = this;
      var stateInjector = function() {
        var args = Array.prototype.slice.call(arguments);
        if( args[0] === 'meta' ) {
          args[args.length - 1](null, self.chainenv.meta);
        } else {
          _get.apply(self.db, args);
        }
      }
      this.db.get = stateInjector;
      this.blockchain = new Blockchain(this.db, false);
      cb();
    }).bind(this),
    this.restoreOldState.bind(this)
  ], (err, block) => {
    this.parentBlock = block;
    this.pendingBlock = this.createBlock();
    this.dhInterface && this.dhInterface.initLazyLoading();
    cb && cb(null, this);
  });
}

DappleChain.prototype.setLogger = function(logger) {
  this.logger = logger;
}

// TODO - omg -- remember to save state on * stuff
DappleChain.prototype.updateState = function () {
  if(this.chainenv.branch) {
    this.chainenv.meta = this.blockchain.meta;
    this.chainenv.stateRoot = toHex(this.stateTrie.root);
  }
}

DappleChain.prototype.loadState = function (cb) {
  // TODO - is this really nessecery or can't I inject this into blockchain.meta?
  this.db.put('meta', this.chainenv.meta, {valueEncoding: 'json'}, (err,res) => {
    cb();
  });
}

DappleChain.prototype.log = function () {
  var displayNiceBlock = (b) => {
    // Display block nicely
    console.log(Formatters.blockMedium(b));
    // Display Transactions nicely
    console.log(b.transactions.map(Formatters.txMedium).join('\n'),'\n');

    this.blockchain.getBlock('0x'+b.header.parentHash.toString('hex'), (err, pb) => {
      if(err) throw err;
      let isForkRoot = this.chainenv.forkRoot === parseInt('0x'+pb.header.number.toString('hex'));
      if(!pb.isGenesis() && !isForkRoot) {
        displayNiceBlock(pb);
      }
    });
  }
  displayNiceBlock(this.parentBlock);
}

DappleChain.prototype.blockFromBlockTag = function(tag, cb) {
  var block = null;

  if (tag == "latest" || tag == "pending") {
    block = this.latestBlock();
  } else if (tag == "earliest") {

    this.blockchain.getBlock(['0x00'], cb);
  } else {
    this.blockchain.getBlock([parseInt(to.hex(tag))], cb);
  }
};

DappleChain.prototype.restoreOldState = function (cb) {
  this.blockchain.getBlock('0x'+this.blockchain.meta.rawHead, cb)
}

DappleChain.prototype.getLogger = function() {
    return this.logger;
}

DappleChain.prototype.defaultAccount = function () {
  return this.chainenv.defaultAccount;
}

DappleChain.prototype.addAccount = function(opts, callback) {
  var self = this;

  if (typeof(opts) == "function") {
    callback = opts;
    opts = {};
  }
  callback = optionalCallback(callback);

  if (typeof(opts) == "undefined") {
    opts = {};
  }

  var secretKey = opts.secretKey ? new Buffer(toHex(opts.secretKey).slice(2), 'hex') : crypto.randomBytes(32);
  var publicKey = utils.privateToPublic(new Buffer(secretKey));
  var address = utils.pubToAddress(new Buffer(publicKey));
  var account = new Account(opts);

  this.accounts[toHex(address)] = {
    secretKey: secretKey,
    publicKey: publicKey,
    address: toHex(address),
    account: account
  };
  callback();
}

DappleChain.prototype.setBalance = function (address, balance, cb) {
  var that = this;
  address = new Buffer(toHex(address).slice(2), 'hex');
  balance = new Buffer(toHex(balance).slice(2), 'hex');

  if (!cb) { cb = function(){}; }

  that.vm.stateManager.putAccountBalance(address, balance, function () {
    that.vm.stateManager.cache.flush(cb);
  });
}

DappleChain.prototype.accountAddresses = function() {
  return Object.keys(this.accounts);
}

DappleChain.prototype.createBlock = function() {
  var parent = this.parentBlock;
  var parentJson = parent.header.toJSON();
  parentJson[8] = parentJson[8]==='0x' ? '0x01' : '0x'+(parseInt(parentJson[8]).toString(16))
  var block = new Block([parentJson, [], []]);

  if(this.parentBlock) {
    block.header.number = utils.bufferToInt(this.parentBlock.header.number) + 1;
  } else {
    block.header.number = 0;
  }

  // Set the timestamp before processing txs
  block.header.timestamp = toHex(this.currentTime());

  if (parent != null) {
    block.header.parentHash = toHex(parent.hash());
  }

  return block;
}

DappleChain.prototype.setGasLimit = function(newLimit) {
  if (typeof(newLimit) == "number") {
    newLimit = utils.intToHex(newLimit);
  }
  // this.gasLimit = newLimit;
  this.pendingBlock.header.gasLimit = newLimit;
};

DappleChain.prototype.blockNumber = function() {
  return utils.bufferToInt(this.parentBlock.header.number);
};

DappleChain.prototype.currentTime = function() {
  var real_time = new Date().getTime() / 1000 | 0;
  return real_time + (this.time_difference || 0);
};

DappleChain.prototype.increaseTime = function(seconds, cb) {
  this.time_difference += seconds;
  this.mine(cb); // to ensure change in next mine
};

DappleChain.prototype.mine = function(cb) {
  var block = this.pendingBlock;

  this.parentBlock = block;


  this.blockchain.putBlock(block, () => {
    // this.block.putBlock(block);

    // Update our caches.
    this.blockHashes[toHex(block.hash())] = block;

    this.pendingBlock = this.createBlock();
    this.updateState();
    cb();
  });
}

//TODO: add params to this to specify block params
DappleChain.prototype.addBlock = function(cb) {
  this.mine(cb)
}

DappleChain.prototype.latestBlock = function() {
  return this.parentBlock;
}

DappleChain.prototype.gasPrice = function() {
  return '1';
}

DappleChain.prototype.getBalance = function(address, callback) {
  var self = this;

  address = new Buffer(utils.stripHexPrefix(address), "hex");
  this.vm.stateManager.getAccountBalance(address, function(err, result) {
    if (err != null) {
      callback(err);
    } else {
      callback(null, toHex(result));
    }
  });
}

DappleChain.prototype.getTransactionCount = function(address, callback) {
  var self = this;
  address = new Buffer(utils.stripHexPrefix(address), 'hex');

  this.stateTrie.get(address, (err, val) => {
    var account = new Account(val);
    callback(null, toHex(account.nonce));
  });
}

DappleChain.prototype.getCode = function(_address, cb) {
  var address = new Buffer(utils.stripHexPrefix(_address), "hex");

  this.stateTrie.get(address, (err, val) => {
    var account = new Account(val);
    if(account.codeHash) {
      account.getCode(this.stateTrie, (err, res) => {
        cb(err, '0x'+res.toString('hex'));
      });
    } else {
      cb(null, "");
    }
  })
}

DappleChain.prototype.getBlockByNumber = function(number) {

  var block;
  if (number == "latest" || number == "pending") {
    block = this.latestBlock();
    number = this.blockNumber();
  } else {
    block = deasync(this.blockchain.getBlock).apply(this.blockchain, [number]);
  }
  var self = this;
  return {
    number: toHex(number),
    hash: toHex(block.hash()),
    parentHash: toHex(block.header.parentHash),
    nonce: toHex(block.header.nonce),
    sha3Uncles: toHex(block.header.uncleHash),
    logsBloom: toHex(block.header.bloom),
    transactionsRoot: toHex(block.header.transactionsTrie),
    stateRoot: toHex(block.header.stateRoot),
    receiptRoot: toHex(block.header.receiptTrie),
    miner: toHex(block.header.coinbase),
    difficulty: toHex(block.header.difficulty),
    totalDifficulty: toHex(block.header.difficulty), // TODO: Figure out what to do here.
    extraData: toHex(block.header.extraData),
    size: toHex(1000), // TODO: Do something better here
    gasLimit: toHex(block.header.gasLimit),
    gasUsed: toHex(block.header.gasUsed),
    timestamp: toHex(block.header.timestamp),
    transactions: [], //block.transactions.map(function(tx) {return tx.toJSON(true)}),
    uncles: [], // block.uncleHeaders.map(function(uncleHash) {return self.toHex(uncleHash)})
  };
}

// TODO - refactor to trie
DappleChain.prototype.getBlockByHash = function(hash) {
  var block = this.blockHashes[toHex(hash)];
  return this.getBlockByNumber(toHex(block.header.number));
}

DappleChain.prototype.getTransactionReceipt = function(hash) {
  var result = this.transactions[hash];

  if (result !== undefined) {
    return {
      transactionHash: hash,
      transactionIndex: toHex(utils.intToHex(0)),
      blockHash: toHex(result.block.hash()),
      blockNumber: result.block_number,
      cumulativeGasUsed: result.gasUsed,  // TODO: What should this be?
      gasUsed: result.gasUsed,
      contractAddress: result.createdAddress,
      logs: result.logs
    };
  }
  else {
    return null;
  }
}

DappleChain.prototype.getTransactionByHash = function(hash) {
  var result = this.transactions[hash];

  if (result !== undefined) {
    var tx = result.tx;

    return {
      hash: hash,
      nonce: toHex(tx.nonce),
      blockHash: toHex(result.block.hash()),
      blockNumber: result.block_number,
      transactionIndex:  "0x0",
      from: toHex(tx.getSenderAddress()),
      to: toHex(tx.to),
      value: toHex(tx.value), // 520464
      gas: toHex(tx.gasLimit), // 520464
      gasPrice: toHex(tx.gasPrice),
      input: toHex(tx.data),
    };
  }
  else {
    return null;
  }
}

// TODO add storage request
// https://github.com/ethereumjs/testrpc/blob/master/lib/blockchain.js#L581
// https://github.com/ethereumjs/testrpc/blob/master/lib/blockchain.js#L358

DappleChain.prototype.queueRawTransaction = function(rawTx, callback) {

  var tx = new Transaction(new Buffer(rawTx));
  if( !tx.verifySignature() ) {
    callback("wrong signature");
  } else {
    this.queueAction("eth_sendTransaction", tx, callback);
  }
};

DappleChain.prototype.queueTransaction = function(tx_params, callback) {
  this.queueAction("eth_sendTransaction", tx_params, callback);
};

DappleChain.prototype.queueCall = function(tx_params, callback) {
  this.queueAction("eth_call", tx_params, callback);
};

DappleChain.prototype.queueStorage = function(address, position, block, callback) {

  this.transaction_queue.push({
    method: "eth_getStorageAt",
    address: utils.addHexPrefix(address),
    position: utils.addHexPrefix(position),
    block: block,
    callback: callback
  });

  // We know there's work, so get started.
  this.processNextAction();
}

DappleChain.prototype.queueAction = function(method, tx_params, callback) {
  if (tx_params.from == null) {
    if (method === 'eth_call')
      tx_params.from = this.coinbase;
    else {
      callback(new Error("from not found; is required"));
      return;
    }
  }

  if(!(tx_params instanceof Transaction) && !(tx_params instanceof FakeTransaction) && !tx_params.fake) {
    tx_params.from = toHex(tx_params.from);
    var rawTx = {
        gasPrice: "0x1",
        gasLimit: this.pendingBlock.header.gasLimit,
        value: '0x0',
        data: ''
    };
    if (tx_params.gasPrice != null) {
      rawTx.gasPrice = toHex(tx_params.gasPrice);
    }

    if (tx_params.gas != null) {
      rawTx.gasLimit = toHex(tx_params.gas);
    }

    if (tx_params.gasPrice != null) {
      rawTx.gasPrice = toHex(tx_params.gasPrice);
    }

    if (tx_params.to != null) {
      rawTx.to = toHex(tx_params.to);
    }

    if (tx_params.value != null) {
      rawTx.value = toHex(tx_params.value);
    }

    if (tx_params.data != null) {
      rawTx.data = toHex(tx_params.data);
    }

    if (tx_params.nonce != null) {
      rawTx.nonce = toHex(tx_params.nonce);
    }
  } else {
    var rawTx = tx_params;
  }

  this.transaction_queue.push({
    method: method,
    from: tx_params.from,
    rawTx: rawTx,
    callback: callback
  });

  // We know there's work, so get started.
  this.processNextAction();
};


DappleChain.prototype.processNextAction = function(override) {
  var self = this;

  if (override != true) {
    if (this.transaction_processing == true || this.transaction_queue.length == 0) {
      return;
    }
  }

  var queued = this.transaction_queue.shift();

  this.transaction_processing = true;

  var intermediary = function(err, result) {
    queued.callback(err, result);

    if (self.transaction_queue.length > 0) {
      self.processNextAction(true);
    } else {
      self.transaction_processing = false;
    }
  };

  // Update the latest unmined block's timestamp before calls or txs
  this.updateCurrentTime();

  if (queued.method == "eth_sendTransaction") {
    this.processTransaction(queued.from, queued.rawTx, intermediary);
  } else if(queued.method == "eth_getStorageAt") {
    this.processStorageRequest(queued.address, queued.position, queued.block, intermediary);
  } else {
    this.processCall(queued.from, queued.rawTx, intermediary);
  }
};

DappleChain.prototype.processTransaction = function(from, rawTx, callback) {
  var self = this;

  var tx_ok = false;
  if(rawTx instanceof Transaction || rawTx instanceof FakeTransaction || rawTx.fake) {
    var tx = rawTx;
    tx_ok = true;
  } else {
    var tx = new Transaction(rawTx);
  }

  var block = this.pendingBlock;
  var address = new Buffer(utils.stripHexPrefix(from), "hex");

  if( !tx_ok && this.chainenv.fakedOwnership.indexOf(from) == -1 ) {
    var privateKey = new Buffer(this.accounts[from].secretKey, 'hex');
    this.chainenv.devmode = true;
  }

  this.stateTrie.get(address, function(err, val) {
    var account = new Account(val);

    // If the user specified a nonce, use that instead.
    if (rawTx.nonce == null) {
      tx.nonce = toHex(account.nonce);
    }

    if( !tx_ok ) {
      if( self.chainenv.fakedOwnership.indexOf(from) == -1 ) {
        tx.sign(privateKey);
      } else {
        tx.sign(new Buffer('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'hex'))
        // fake transaction origin
        tx._from = new Buffer(from.slice(2), 'hex');
      }
    }

    var tx_hash = toHex(tx.hash());

    // Add the transaction to the block.
    block.transactions.push(tx);

    self.vm.runBlock({
      block: block,
      generate: true,
      self: self,
      ds: self.ds
    }, (err, results) => {
      self.mine(() => {
        if (err) {
          callback(err);
          return;
        }

        if (results.error != null) {
          callback(new Error("VM error: " + results.error));
          return;
        }

        var receipt = results.receipts[0];
        var result = results.results[0];

        if (result.vm.exception != 1) {
          callback(new Error("VM Exception while executing transaction: " + result.vm.exceptionError));
          return;
        }

        var logs = [];

        for (var i = 0; i < receipt.logs.length; i++) {
          var log = receipt.logs[i];
          var address = toHex(log[0]);
          var topics = []

          for (var j = 0; j < log[1].length; j++) {
            topics.push(toHex(log[1][j]));
          }

          var data = toHex(log[2]);

          logs.push({
            logIndex: toHex(i),
            transactionIndex: "0x0",
            transactionHash: tx_hash,
            blockHash: toHex(block.hash()),
            blockNumber: toHex(block.header.number),
            address: address,
            data: data,
            topics: topics,
            type: "mined"
          });
        }

        var tx_result = {
          tx: tx,
          block_number: toHex(block.header.number),
          block: block,
          stateRoot: toHex(receipt.stateRoot),
          gasUsed: toHex(receipt.gasUsed),
          bitvector: toHex(receipt.bitvector),
          logs: logs,
          createdAddress: result.createdAddress != null ? toHex(result.createdAddress) : null,
          bloom: result.bloom,
          amountSpent: result.amountSpent
        };

        self.transactions[tx_hash] = tx_result;

        // self.logger.log("");

        if (tx_result.createdAddress != null) {
          // self.logger.log("  Contract created: " + tx_result.createdAddress);
          self.contracts[tx_result.createdAddress] = rawTx.data;
        }

        // self.logger.log("  Gas usage: " + utils.bufferToInt(toHex(tx_result.gasUsed)));
        // self.logger.log("");

        callback(null, tx_hash);
      });
    });
  });
};

DappleChain.prototype.processCall = function(from, rawTx, callback) {
  var self = this;

  var block = this.latestBlock();
  var address = new Buffer(utils.stripHexPrefix(from), "hex");
  if( this.chainenv.fakedOwnership.indexOf(from) == -1 ) {
    var privateKey = new Buffer(this.accounts[from].secretKey, 'hex');
  }

  this.stateTrie.get(address, function(err, val) {
    var account = new Account(val);

    // If the user specified a nonce, use that instead.
    if (rawTx.nonce == null) {
      rawTx.nonce = toHex(account.nonce);
    }

    var tx = new Transaction(rawTx);

    if( self.chainenv.fakedOwnership.indexOf(from) == -1 ) {
      tx.sign(privateKey);
    } else {
      tx.sign(new Buffer('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'hex'))
      // fake transaction origin
      tx._from = new Buffer(from.slice(2), 'hex');
    }

    var tx_hash = toHex(tx.hash());

    self.stateTrie.checkpoint();

    self.vm.runTx({
      tx: tx,
      block: block,
      ds: self.ds
    }, function(err, results) {
      self.stateTrie.revert();

      if (err) {
        callback(err);
        return;
      }

      if (results.error != null) {
        callback(new Error("VM error: " + results.error));
        return;
      }

      if (results.vm.exception != 1) {
        callback(new Error("VM Exception while executing transaction: " + results.vm.exceptionError));
        return;
      }

      callback(null, toHex(results.vm.return || "0x0"));
    });
  });
};

DappleChain.prototype.processStorageRequest = function(address, position, number, callback) {
  var self = this;

  this.blockFromBlockTag(number, (err, block) => {
    var trie = this.stateTrie;
    // Manipulate the state root in place to maintain checkpoints
    var currentStateRoot = trie.root;
    this.stateTrie.root = block.header.stateRoot;

    trie.get(utils.toBuffer(address), function(err, data) {
      if (err != null) {
        // Put the stateRoot back if there's an error
        trie.root = currentStateRoot;
        return callback(err);
      }

      var account = new Account(data);

      trie.root = account.stateRoot;

      trie.get(utils.toBuffer(position), function(err, value) {
        // Finally, put the stateRoot back for good
        trie.root = currentStateRoot;

        if (err != null) {
          return callback(err);
        }

        if (value) {
          value = utils.rlp.decode(value);
        }

        value = to.hex(value || 0);
        callback(null, value);
      });
    });
  });

}

// Note: Snapshots have 1-based ids.
DappleChain.prototype.snapshot = function() {
  this.snapshots.push(this.stateTrie.root);

  // this.logger.log("Saved snapshot #" + this.snapshots.length);

  return toHex(this.snapshots.length);
};

DappleChain.prototype.revert = function(snapshot_id) {
  // Convert from hex.
  snapshot_id = utils.bufferToInt(snapshot_id);

  // this.logger.log("Reverting to snapshot #" + snapshot_id);

  if (snapshot_id > this.snapshots.length) {
    return false;
  }

  // Convert to zero based.
  snapshot_id = snapshot_id - 1;

  // Revert to previous state.
  this.stateTrie.root = this.snapshots[snapshot_id];

  // Remove all snapshots after and including the one we reverted to.
  this.snapshots.splice(snapshot_id);

  return true;
};

DappleChain.prototype.updateCurrentTime = function() {
  var block = this.pendingBlock;
  block.header.timestamp = toHex(this.currentTime());
}

module.exports = DappleChain;
