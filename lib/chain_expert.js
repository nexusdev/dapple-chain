"use strict";

// web3 and chain knowledge base
// 
var chains = {
  ETH: {
    genesis: "0xd4e56740f876aef8c010b86a40d5f56745a118d0906a34e69aec8c0db1cb8fa3",
    block2m: "0xc0f4906fea23cf6f3cce98cb44e8e1449e455b28d684dfa9ff65426495584de6"
  },
  ETC: {
    genesis: "0xd4e56740f876aef8c010b86a40d5f56745a118d0906a34e69aec8c0db1cb8fa3",
    block2m: "0x3b56d9e73aa7cac630eb718c24923757a7d08b2b1a52d62676a1749e1f345be3"
  },
  MORDEN: {
    genesis: "0x0cd786a2425d16f152c658316c423e6ce1181e15c3295826d7c9904cba9ce303"
  }
}

module.exports = {
  // add a new environment
  new: () => {
  
  },
  chains,
  analyze: (web3, cb) => {
    web3.version.getNode((err, res) => {
      if(err || !res) return cb(err);
      if(res.toLowerCase().indexOf('testrpc') > -1) {
        return cb(null, 'TestRPC');
      } else {
        web3.eth.getBlock(0, (err, block) => {
          if(err || !block) return cb(err);
          if( block.hash === chains.ETH.genesis ) { // livenet
            web3.eth.getBlock(2000000, (err, block2) => {
              if(err || !block2) return cb(new Error('Cannot get block 2.000.000'));
              if( block2.hash === chains.ETH.block2m) {
                return cb(null, 'ETH');
              } else if (block2.hash === chains.ETC.block2m) {
                return cb(null, 'ETC');
              } else {
                return cb(new Error('Unknown chain'));
              }
            });
          } else if( block.hash === chains.MORDEN.genesis) { // morden
            return cb(null, 'MORDEN');
          } else { // custom
            return cb(null, 'CUSTOM');
          }
        });
      }
    });
  }
};
