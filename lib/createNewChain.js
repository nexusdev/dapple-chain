var Trie = require('merkle-patricia-tree/secure');
var utils = require('ethereumjs-util');
var Block = require('ethereumjs-block');
var Account = require('ethereumjs-account');
var async = require('async');
var BigNumber = require('bignumber.js');


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


var toHex = function(val) {
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


var generateGenesisBlock = function(db, genesis, addrs, cb) {
  var trie = new Trie(db);

  addrs.forEach( addr => {
    genesis.alloc[addr] = '0x'+Math.pow(2,255).toString(16)
  });

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

  // var acc = new Account([
  //   toHex(parseInt(10)),
  //   0,
  //   '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421',
  //   '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470'
  // ]);

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
      acc.balance = toHex((new BigNumber(genesis.alloc[account])).toString(16));
       trie.put(new Buffer(account.slice(2), 'hex'), acc.serialize(), cb);
    }, callb );
  }
  header[3] = '0x'+trie.root.toString('hex');

  var block = new Block({header: header, uncleHeaders: [], transactions: []});
  // this.parentBlock = block;
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

  // TODO - async
  genStateRoot(() => {
    db.batch(dbOps, function() { cb(null, {meta, stateRoot: toHex(trie.root)}); });
  });
}



module.exports = (db, addrs, cb) => {
  return generateGenesisBlock(db, genesis, addrs || [], cb);
}
