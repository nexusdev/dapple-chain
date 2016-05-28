"use strict";

var levelup = require('levelup');
var async = require('async');
var rlp = require('rlp');
var Block = require('ethereumjs-block');
var utils = require('ethereumjs-util');

var BLOCK_HEX_PREFIX = '626c6f636b2d';
var BLOCK_HEADER_HEX_SUFFIX = '2d686561646572';
var BLOCK_BODY_HEX_SUFFIX = '2d626f6479';
var BLOCK_TD_HEX_SUFFIX = '2d7464';

class GethInterface {

  constructor (path, cb) {
    this.gethDb = levelup(path, cb);
  }

  // wraps ethereumjs's leveldb
  // - inject new get function which tracs undefined keys and imports them
  //   from geth database
  initLazyLoading() {
    var that = this;
    var oldGet_ = this.db.get;
    that.db.get = function () {
      var args = Array.prototype.slice.call(arguments);
      var dbContext = this;
      var remoteDBImporterArgs = args.slice(0, -1).concat([function(err, val){
        if(!err) {
          args[args.length - 1](null, val);
        } else {
          that.gethDb.get(args[0], {valueEncoding: 'hex'}, (err, val) => {
            if(err) throw Error(`Key ${args[0].toString('hex')} not found in geths db`);
            that.db.put(args[0], new Buffer(val, 'hex'), (err, res) => {
              oldGet_.apply(dbContext, remoteDBImporterArgs);
            });
          })
        }
      }]);
      oldGet_.apply(dbContext, remoteDBImporterArgs);
    }
  }

  initDb (db) {
    this.db = db;
  }

  getLastBlock (cb) {
    this.gethDb.get(new Buffer('LastBlock'), {valueEncoding: 'hex'}, (err, res) => {
      cb(err, res);
    });
  }

  getBlockHeader (hash, cb) {
    this.gethDb.get(new Buffer( BLOCK_HEX_PREFIX + hash + BLOCK_HEADER_HEX_SUFFIX, 'hex'),{valueEncoding: 'hex'}, cb);
  }

  getBlockBody (hash, cb) {
    this.gethDb.get(new Buffer( BLOCK_HEX_PREFIX + hash + BLOCK_BODY_HEX_SUFFIX, 'hex'), {valueEncoding: 'hex'}, cb);
  }

  getBlockTD (hash, cb) {
    this.gethDb.get(new Buffer( BLOCK_HEX_PREFIX + hash + BLOCK_TD_HEX_SUFFIX, 'hex'), {valueEncoding: 'hex'}, cb);
  }

  portBlock (hash, cb) {
    this.getBlockHeader(hash, (err, encodedBlock) => {
      if(err) cb(err);

      // decode header
      let header = rlp.decode(new Buffer(encodedBlock, 'hex'));

      // TODO - wrong difficulty and wrong transaction root
      // block
      let b = new Block([header, [], []]);

      // insert fork root block into the database
      this.db.put(b.hash().toString('hex'), rlp.encode([header, [], []]), (err, res) => {
      });

      this.db.put(parseInt('0x' + b.header.number.toString('hex')), b.hash().toString('hex'), (err, res) => {
      });

      // along with thereumjs's blockDetails json format
      var blockDetails = {
        parent: b.header.parentHash.toString('hex'),
        td: '',
        number: utils.bufferToInt(b.header.number),
        child: null,
        staleChildren: [],
        genesis: b.isGenesis()
      }
      this.db.put('detail'+b.hash().toString('hex'), blockDetails, {valueEncoding: 'json'}, (err, res) => {
      });

      cb(null, b);

    });
  }

  forkLatest(cb) {
    var that = this;
    async.waterfall([
      this.getLastBlock.bind(this),
      this.portBlock.bind(this)
      // this.getBlockHeader.bind(this)
    ], (err, b) => {
      if(err) cb(err);

      this.portBlock(b.header.parentHash.toString('hex'), () => {
        cb(null, {
          branch: true,
          stateRoot: '0x'+b.header.stateRoot.toString('hex'),
          forkRoot: parseInt('0x'+b.header.number.toString('hex')),
          meta: {
            "heads": {},
            "td": "0",
            "rawHead": b.hash().toString('hex'),
            "height": parseInt('0x'+b.header.number.toString('hex')),
            "genesis": "d4e56740f876aef8c010b86a40d5f56745a118d0906a34e69aec8c0db1cb8fa3"
          }
        });
      });

    });
  }


}

module.exports = GethInterface;
