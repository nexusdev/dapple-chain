var assert = require('assert');
var GethInterface = require('../lib/gethInterface.js');

describe.skip('fastrpc.blockchain', function() {
  var gi;

  before((done) => {
    gi = new GethInterface('/Users/mhhf/Library/Ethereum/chaindata', () => {
      done();
    });
  });


  it("should find the latest block", function (done) {
    gi.getLastBlock((err, block) => {
      assert(err === null);
      assert(typeof block === 'string');
      done();
    });
  });

  it("should load the last block", function (done) {
    gi.getLastBlock((err, blockHash) => {
      gi.getBlockHeader(blockHash, (err, block) => {
        // assert(err === null);
        // assert(typeof block === 'string');
        done();
      })
    });
  });


});

