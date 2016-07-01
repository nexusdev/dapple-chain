"use strict";
var Account = require('ethereumjs-account');
var Block = require('ethereumjs-block');
var crypto = require('crypto');
var optionalCallback = require('./utils.js').optionalCallback;
var VM = require('ethereumjs-vm');
var Blockchain = require('ethereumjs-blockchain');
var Trie = require('merkle-patricia-tree/secure');
var Transaction = require('ethereumjs-tx');
var utils = require('ethereumjs-util');
var levelup = require('levelup');
var path = require('path');
var deasync = require('deasync');
var async = require('async');
var common = require('ethereum-common');
var BigNumber = require('bignumber.js');
var rlp = require('rlp');
var GethInterface = require('./gethInterface.js');
var DapphubInterface = require('./dapphubInterface.js');
var fs = require('fs');
var to = require('ethereumjs-testrpc/lib/to');
var tmp = require('tmp');

// TODO - refactor this out of dapplechain
var Formatters = require('./formatters.js');

/* Dapple-Chain Blockchain
 *
 * @param opts options object
 *  - packageRoot path to the package root directory
 *
 */
var DappleChain = function(opts) {
  this._initDone = false;

  var dir;
  if(!opts.packageRoot) {
    dir = tmp.dirSync().name;
  } else {
    dir = path.join(opts.packageRoot,'.dapple/chain_db')
  }
  if(opts.packageRoot && !fs.existsSync(path.join(opts.packageRoot, '.dapple'))) fs.mkdirSync(path.join(opts.packageRoot, '.dapple'));

  // TODO - refactor this mess
    async.parallel([
      levelup.bind(this, dir),
      // (cb) => { let gi = new GethInterface(() => { cb(null, gi) });}
    ], (err, res) => {
      if(err) throw err;
      this.db = res[0]
      this.dhInterface = new DapphubInterface();
      this.dhInterface.initDb(this.db);
      this.stateTrie = new Trie(this.db);
      this.mode = opts.mode || 'persistent'; // persistent, temporary
      this.nonces = {};
      this.accounts = {};
      this.blocks = [];
      this.coinbase = null;
      this.contracts = {};
      this.blockHashes = {};
      this.transactions = {};
      this.latest_filter_id = 1;
      this.transaction_queue = [];
      this.transaction_processing == false;
      // this.parentBlock = null;
      this.lastBlockHash = "0x0000000000000000000000000000000000000000000000000000000000000000";
      this.snapshots = [];
      this.logger = console;
      this.time_difference = 0;
      this.vm = new VM(this.stateTrie, null, {
        enableHomestead: true
      });
      // this.vm.on('step', (step) => {
      //   console.log(step.opcode.name);
      // });
      async.waterfall([
        this.initState.bind(this),
        ((cb) => {
          this.blockchain = new Blockchain(this.db, false);
          if(!this.blockchain._initDone) this.blockchain._pendingOps.push(cb);
          // deasync.loopWhile(function(){return !that.blockchain._initDone || !that.gethDb.isOpen();});
        }).bind(this),
        this.restoreOldState.bind(this)
      ], (err, block) => {
        this.parentBlock = block;
        this.pendingBlock = this.createBlock();
        this.dhInterface.initLazyLoading();
        this._initDone = true;
      })
    });

  // TODO - investigate how to perform transactions from an unowned address
  deasync.loopWhile( () => {return !this._initDone; });
}

DappleChain.prototype.initState = function (cb) {
  this.db.get("state", {valueEncoding: 'json'}, (err, state) => {
    if(err) {
      this.createState(cb);
    } else {
      this.state = state;
      this.loadState(cb);
    }
  });
}

DappleChain.prototype.setLogger = function(logger) {
  this.logger = logger;
}

DappleChain.prototype.updateState = function () {
  var env = this.state.pointers[this.state.head];
  if(env.branch) {
    env.meta = this.blockchain.meta;
    env.stateRoot = this.toHex(this.stateTrie.root);
  }
  this._saveState();
}

// TODO - better name
DappleChain.prototype.loadState = function (cb) {
  var env = this.state.pointers[this.state.head];
  this.stateTrie.root = new Buffer(env.stateRoot.slice(2), 'hex');
  // TODO - is this really nessecery or can't I inject this into blockchain.meta?
  this.db.put('meta', env.meta, {valueEncoding: 'json'}, cb);
}

DappleChain.prototype._saveState = function (persistent) {
  // TODO - async
  if(this.mode === 'persistent' || persistent) {
    deasync(this.db.put).apply(this.db, ['state', this.state, {valueEncoding: 'json'}]);
  }
}

DappleChain.prototype.createState = function (callback) {
  var genesis = {
    "nonce": "0x0000000000000042",
    "difficulty": "0x000000000",
    "alloc": {
      "0x0000000000000000000000000000000000000000": '0x'+Math.pow(2,255).toString(16)
    },
    "mixhash": "0x0000000000000000000000000000000000000000000000000000000000000000",
    "coinbase": "0x0000000000000000000000000000000000000000",
    "timestamp": "0x00",
    "parentHash": "0x0000000000000000000000000000000000000000000000000000000000000000",
    "gasLimit": 900000000000
  };

  var meta = this.createNewChain(genesis);
  this.state = {};
  this.state.head = 'master';
  this.state.pointers = {
    master: {
      branch: true,
      meta: meta,
      stateRoot: this.toHex(this.stateTrie.root),
      fakedOwnership: ['0x0000000000000000000000000000000000000000'],
      defaultAccount: '0x0000000000000000000000000000000000000000',
      devmode: true
    }
  };
  if(this.dhInterface) {
    this.dhInterface.forkLatest((err, env) => {
      if(err) throw new Error(err);
      this.state.pointers.livenet = env;
      this._saveState(true);
      callback();
    });
  } else {
    callback();
  }

}

DappleChain.prototype.createNewChain = function (genesis) {
  return deasync(this.generateGenesisBlock).apply(this, [genesis]);
}

DappleChain.prototype.generateGenesisBlock = function(genesis, cb) {

  var header = [
  '0x0000000000000000000000000000000000000000000000000000000000000000', // 0 parentHash
  '0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347', // 1 uncleHash
  '0x0000000000000000000000000000000000000000', // 2 coinbase
  '0xd7f8974fb5ac78d9ac099b9ad5018bedc2ce0a72dad1827a1709da30580f0544', // 3 stateRoot
  '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421', // 4 transactionTrie
  '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421', // 5 receiptTrie
  '0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000', // 6 bloom
  '0x0000000001', // 7 difficulty
  '0x00', // 8 number
  genesis.gasLimit, // 9 gasLimit
  '0x', // 10 gasUsed
  '0x', // 11 timestamp
  '0x11bbe8db4e347b4e8c937c1c8370e4b5ed33adb3db69cbdb7a38e1e50b1b82fa', // 12 extraData
  '0x0000000000000000000000000000000000000000000000000000000000000000', // 13 mixHash
  '0x0000000000000042' ]; // 14 nonce

  var that = this;
  var trie = this.stateTrie;

  var acc = new Account([
    this.toHex(parseInt(10)),
    0,
    '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421',
    '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470'
  ]);

  // Generate Mainnet Genesis
  //
  // var genStateRoot = function (callb) {
  //   async.eachSeries(Object.keys(common.genesisState), function (account, cb) {
  //     var acc = new Account();
  //     acc.balance = that.toHex((new BigNumber(common.genesisState[account])).toString(16));
  //      trie.put(new Buffer(account, 'hex'), acc.serialize(), cb);
  //   }, callb );
  // }

  var genStateRoot = function (callb) {
    async.eachSeries(Object.keys(genesis.alloc), function (account, cb) {
      var acc = new Account();
      acc.balance = that.toHex((new BigNumber(genesis.alloc[account])).toString(16));
       trie.put(new Buffer(account.slice(2), 'hex'), acc.serialize(), cb);
    }, callb );
  }
  // TODO - async
  deasync(genStateRoot)();
  header[3] = '0x'+trie.root.toString('hex');

  var block = new Block({header: header, uncleHeaders: [], transactions: []});
  this.parentBlock = block;
  var blockHash = block.hash();

  // store the block details
  var blockDetails = {
    parent: block.header.parentHash.toString('hex'),
    td: parseInt(genesis.difficulty).toString(),
    number: 0,
    child: null,
    staleChildren: [],
    genesis: true,
    inChain: true
  }
  var dbOps = [];

  dbOps.push({
    type: 'put',
    key: 'detail' + blockHash.toString('hex'),
    valueEncoding: 'json',
    value: blockDetails
  });
  // store the block
  dbOps.push({
    type: 'put',
    key: blockHash.toString('hex'),
    valueEncoding: 'binary',
    value: block.serialize()
  });
  // index by number
  dbOps.push({
    type: 'put',
    key: '00',
    valueEncoding: 'binary',
    value: blockHash
  });

  var meta = { heads: {},
    td: blockDetails.td,
    rawHead: blockHash.toString('hex'),
    height: 0,
    genesis: blockHash.toString('hex')
  };

  // save meta
  dbOps.push({
    type: 'put',
    key: 'meta',
    valueEncoding: 'json',
    value: meta
  });

  this.db.batch(dbOps, function() { cb(null, meta); });
}

DappleChain.prototype.log = function () {
  var displayNiceBlock = (b) => {
    // Display block nicely
    console.log(Formatters.blockMedium(b));
    // Display Transactions nicely
    console.log(b.transactions.map(Formatters.txMedium).join('\n'),'\n');

    this.blockchain.getBlock('0x'+b.header.parentHash.toString('hex'), (err, pb) => {
      if(err) throw err;
      let isForkRoot = this.state.pointers[this.state.head].forkRoot === parseInt('0x'+pb.header.number.toString('hex'));
      if(!pb.isGenesis() && !isForkRoot) {
        displayNiceBlock(pb);
      }
    });
  }
  displayNiceBlock(this.parentBlock);
}

DappleChain.prototype.blockFromBlockTag = function(tag) {
  var block = null;

  if (tag == "latest" || tag == "pending") {
    block = this.latestBlock();
  } else if (tag == "earliest") {

    block = deasync(this.blockchain.getBlock).apply(this.blockchain, ['0x00']);
    // block = this.blocks[0];
  } else {
    block = deasync(this.blockchain.getBlock).apply(this.blockchain, [parseInt(to.hex(tag))]);
    // if (blockNumber < this.blocks.length) {
    //   block = this.blocks[blockNumber];
    // } else {
    //   block = this.latestBlock();
    // }
  }

  return block;
};

DappleChain.prototype.fork = function (name) {
  if(name in this.state.pointers) throw new Error(`Branch "${name}" already exists`);
  this.state.pointers[name] = this.state.pointers[this.state.head];
  console.log(`Forked ${this.state.head} to ${name}`);
  this.state.head = name;
  this._saveState();
}

// TODO - assign number keys to all blocks from HEAD to forkRoot
DappleChain.prototype.checkout = function (name) {
  if(!name in this.state.pointers) throw new Error(`No branch with name "${name}"`);
  this.state.head = name;
  this._saveState();
  console.log(`switched to ${name}`);
}

DappleChain.prototype.restoreOldState = function (cb) {
  this.blockchain.getBlock('0x'+this.blockchain.meta.rawHead, cb)
}

DappleChain.prototype.getLogger = function() {
    return this.logger;
}

DappleChain.prototype.toHex = function(val) {
  if (typeof val == "number") {
    val = utils.intToHex(val);
  }

  if (val instanceof Buffer) {
    val = val.toString("hex");

    if (val == "") {
      val = "0";
    }
  }

  return utils.addHexPrefix(val);
}

DappleChain.prototype.addFakedOwnership = function (address) {
  if(this.state.pointers[this.state.head].fakedOwnership.indexOf(address) == -1) {
    this.state.pointers[this.state.head].fakedOwnership.push(address);
  }
  this.state.pointers[this.state.head].defaultAccount = address;
  this._saveState();
}

DappleChain.prototype.defaultAccount = function () {
  return this.getEnv().defaultAccount;
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

  var secretKey = opts.secretKey ? Buffer(this.toHex(opts.secretKey).slice(2), 'hex') : crypto.randomBytes(32);
  var publicKey = utils.privateToPublic(new Buffer(secretKey));
  var address = utils.pubToAddress(new Buffer(publicKey));
  var account = new Account(opts);

  this.accounts[self.toHex(address)] = {
    secretKey: secretKey,
    publicKey: publicKey,
    address: self.toHex(address),
    account: account
  };
  callback();
}

DappleChain.prototype.setBalance = function (address, balance, cb) {
  var that = this;
  address = Buffer(that.toHex(address).slice(2), 'hex');
  balance = Buffer(that.toHex(balance).slice(2), 'hex');

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
  

  // block.header.
  // block.header.gasLimit = this.gasLimit;

  // Ensure we have the right block number for the VM.
  // block.header.number = this.toHex(this.blocks.length);
  if(this.parentBlock) {
    block.header.number = utils.bufferToInt(this.parentBlock.header.number) + 1;
  } else {
    block.header.number = 0;
  }

  // Set the timestamp before processing txs
  block.header.timestamp = this.toHex(this.currentTime());

  if (parent != null) {
    block.header.parentHash = this.toHex(parent.hash());
  }

  return block;
}

DappleChain.prototype.setGasLimit = function(newLimit) {
  if (typeof(newLimit) == "number") {
    newLimit = ethUtil.intToHex(newLimit);
  }
  // this.gasLimit = newLimit;
  this.pendingBlock.header.gasLimit = newLimit;
};

DappleChain.prototype.blockNumber = function() {
  // return utils.bufferToInt(this.blocks[this.blocks.length - 1].header.number);
  return utils.bufferToInt(this.parentBlock.header.number);
};

DappleChain.prototype.currentTime = function() {
  var real_time = new Date().getTime() / 1000 | 0;
  return real_time + (this.time_difference || 0);
};

DappleChain.prototype.increaseTime = function(seconds) {
  this.time_difference += seconds;
  this.mine(); // to ensure change in next mine
};

DappleChain.prototype.mine = function() {
  var block = this.pendingBlock;

  // this.blocks.push(block);
  this.parentBlock = block;
  deasync(this.blockchain.putBlock).apply(this.blockchain, [block]);
  // this.block.putBlock(block);

  // Update our caches.
  this.blockHashes[this.toHex(block.hash())] = block;
  this.lastBlockHash = this.toHex(block.hash());

  this.pendingBlock = this.createBlock();
  this.updateState();
}

//TODO: add params to this to specify block params
DappleChain.prototype.addBlock = function() {
  this.mine()
}

DappleChain.prototype.latestBlock = function() {
  return this.parentBlock;
  // return this.blocks[this.blocks.length - 1];
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
      callback(null, self.toHex(result));
    }
  });
}

DappleChain.prototype.getTransactionCount = function(address, callback) {
  var self = this;
  address = new Buffer(utils.stripHexPrefix(address));
  this.vm.stateManager.getAccount(address, function(err, result) {
    if (err != null) {
      callback(err);
    } else {
      callback(null, self.toHex(result.nonce));
    }
  });
}

// TODO place blockchain lookup in here
DappleChain.prototype.getCode = function(address, cb) {
  address = this.toHex(address);
  cb(null, this.contracts[address] || "");
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
    number: self.toHex(number),
    hash: self.toHex(block.hash()),
    parentHash: self.toHex(block.header.parentHash),
    nonce: self.toHex(block.header.nonce),
    sha3Uncles: self.toHex(block.header.uncleHash),
    logsBloom: self.toHex(block.header.bloom),
    transactionsRoot: self.toHex(block.header.transactionsTrie),
    stateRoot: self.toHex(block.header.stateRoot),
    receiptRoot: self.toHex(block.header.receiptTrie),
    miner: self.toHex(block.header.coinbase),
    difficulty: self.toHex(block.header.difficulty),
    totalDifficulty: self.toHex(block.header.difficulty), // TODO: Figure out what to do here.
    extraData: self.toHex(block.header.extraData),
    size: self.toHex(1000), // TODO: Do something better here
    gasLimit: self.toHex(block.header.gasLimit),
    gasUsed: self.toHex(block.header.gasUsed),
    timestamp: self.toHex(block.header.timestamp),
    transactions: [], //block.transactions.map(function(tx) {return tx.toJSON(true)}),
    uncles: [], // block.uncleHeaders.map(function(uncleHash) {return self.toHex(uncleHash)})
  };
}

DappleChain.prototype.getBlockByHash = function(hash) {
  var block = this.blockHashes[this.toHex(hash)];
  return this.getBlockByNumber(this.toHex(block.header.number));
}

DappleChain.prototype.getTransactionReceipt = function(hash) {
  var result = this.transactions[hash];

  if (result !== undefined) {
    return {
      transactionHash: hash,
      transactionIndex: this.toHex(utils.intToHex(0)),
      blockHash: this.toHex(result.block.hash()),
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
      nonce: this.toHex(tx.nonce),
      blockHash: this.toHex(result.block.hash()),
      blockNumber: result.block_number,
      transactionIndex:  "0x0",
      from: this.toHex(tx.getSenderAddress()),
      to: this.toHex(tx.to),
      value: this.toHex(tx.value), // 520464
      gas: this.toHex(tx.gasLimit), // 520464
      gasPrice: this.toHex(tx.gasPrice),
      input: this.toHex(tx.data),
    };
  }
  else {
    return null;
  }
}

// TODO add storage request
// https://github.com/ethereumjs/testrpc/blob/master/lib/blockchain.js#L581
// https://github.com/ethereumjs/testrpc/blob/master/lib/blockchain.js#L358

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

  tx_params.from = this.toHex(tx_params.from);

  var rawTx = {
      gasPrice: "0x1",
      gasLimit: this.pendingBlock.header.gasLimit,
      value: '0x0',
      data: ''
  };

  if (tx_params.gasPrice != null) {
    rawTx.gasPrice = this.toHex(tx_params.gasPrice);
  }

  if (tx_params.gas != null) {
    rawTx.gasLimit = this.toHex(tx_params.gas);
  }

  if (tx_params.gasPrice != null) {
    rawTx.gasPrice = this.toHex(tx_params.gasPrice);
  }

  if (tx_params.to != null) {
    rawTx.to = this.toHex(tx_params.to);
  }

  if (tx_params.value != null) {
    rawTx.value = this.toHex(tx_params.value);
  }

  if (tx_params.data != null) {
    rawTx.data = this.toHex(tx_params.data);
  }

  if (tx_params.nonce != null) {
    rawTx.nonce = this.toHex(tx_params.nonce);
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

DappleChain.prototype.getEnv = function() {
  return this.state.pointers[this.state.head];
}

DappleChain.prototype.processTransaction = function(from, rawTx, callback) {
  var self = this;

  var block = this.pendingBlock;
  var address = new Buffer(utils.stripHexPrefix(from), "hex");
  if( this.getEnv().fakedOwnership.indexOf(from) == -1 ) {
    console.log(from);
    var privateKey = new Buffer(this.accounts[from].secretKey, 'hex');
    this.state.pointers[this.state.head].devmode = true;
  }

  this.stateTrie.get(address, function(err, val) {
    var account = new Account(val);

    // If the user specified a nonce, use that instead.
    if (rawTx.nonce == null) {
      rawTx.nonce = self.toHex(account.nonce);
    }

    var tx = new Transaction(rawTx);

    if( self.getEnv().fakedOwnership.indexOf(from) == -1 ) {
      tx.sign(privateKey);
    } else {
      tx.sign(new Buffer('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'hex'))
      // fake transaction origin
      tx._from = new Buffer(from.slice(2), 'hex');
    }

    var tx_hash = self.toHex(tx.hash());

    // Add the transaction to the block.
    block.transactions.push(tx);

    self.vm.runBlock({
      block: block,
      generate: true,
      self: self
    }, function(err, results) {
      self.mine();

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
        var address = self.toHex(log[0]);
        var topics = []

        for (var j = 0; j < log[1].length; j++) {
          topics.push(self.toHex(log[1][j]));
        }

        var data = self.toHex(log[2]);

        logs.push({
          logIndex: self.toHex(i),
          transactionIndex: "0x0",
          transactionHash: tx_hash,
          blockHash: self.toHex(block.hash()),
          blockNumber: self.toHex(block.header.number),
          address: address,
          data: data,
          topics: topics,
          type: "mined"
        });
      }

      var tx_result = {
        tx: tx,
        block_number: self.toHex(block.header.number),
        block: block,
        stateRoot: self.toHex(receipt.stateRoot),
        gasUsed: self.toHex(receipt.gasUsed),
        bitvector: self.toHex(receipt.bitvector),
        logs: logs,
        createdAddress: result.createdAddress != null ? self.toHex(result.createdAddress) : null,
        bloom: result.bloom,
        amountSpent: result.amountSpent
      };

      self.transactions[tx_hash] = tx_result;

      // self.logger.log("");

      if (tx_result.createdAddress != null) {
        // self.logger.log("  Contract created: " + tx_result.createdAddress);
        self.contracts[tx_result.createdAddress] = rawTx.data;
      }

      // self.logger.log("  Gas usage: " + utils.bufferToInt(self.toHex(tx_result.gasUsed)));
      // self.logger.log("");

      callback(null, tx_hash);
    });
  });
};

DappleChain.prototype.processCall = function(from, rawTx, callback) {
  var self = this;

  var block = this.latestBlock();
  var address = new Buffer(utils.stripHexPrefix(from), "hex");
  if( this.getEnv().fakedOwnership.indexOf(from) == -1 ) {
    var privateKey = new Buffer(this.accounts[from].secretKey, 'hex');
  }

  this.stateTrie.get(address, function(err, val) {
    var account = new Account(val);

    // If the user specified a nonce, use that instead.
    if (rawTx.nonce == null) {
      rawTx.nonce = self.toHex(account.nonce);
    }

    var tx = new Transaction(rawTx);

    if( self.getEnv().fakedOwnership.indexOf(from) == -1 ) {
      tx.sign(privateKey);
    } else {
      tx.sign(new Buffer('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'hex'))
      // fake transaction origin
      tx._from = new Buffer(from.slice(2), 'hex');
    }

    var tx_hash = self.toHex(tx.hash());

    self.stateTrie.checkpoint();

    self.vm.runTx({
      tx: tx,
      block: block
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

      callback(null, self.toHex(results.vm.return || "0x0"));
    });
  });
};

DappleChain.prototype.processStorageRequest = function(address, position, number, callback) {
  var self = this;

  var block = this.blockFromBlockTag(number);
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
}

// Note: Snapshots have 1-based ids.
DappleChain.prototype.snapshot = function() {
  this.snapshots.push(this.stateTrie.root);

  // this.logger.log("Saved snapshot #" + this.snapshots.length);

  return this.toHex(this.snapshots.length);
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
  block.header.timestamp = this.toHex(this.currentTime());
}

module.exports = DappleChain;
