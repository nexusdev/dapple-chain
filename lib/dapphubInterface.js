"use strict";

var levelup = require('levelup');
var async = require('async');
var rlp = require('rlp');
var Block = require('ethereumjs-block');
var utils = require('ethereumjs-util');
var xhr = require('xhr');
var http = require('http');

var BLOCK_HEX_PREFIX = '626c6f636b2d';
var BLOCK_HEADER_HEX_SUFFIX = '2d686561646572';
var BLOCK_BODY_HEX_SUFFIX = '2d626f6479';
var BLOCK_TD_HEX_SUFFIX = '2d7464';

class DapphubInterface {

  constructor (type) {
    if(!type) {
      this.type = 'ETH';
    } else {
      this.type = type;
    }
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
          that.get(args[0].toString('hex'), (err, val) => {
            if(err) throw Error(`Key ${args[0].toString('hex')} not found in geths db`);
            that.db.put(args[0], new Buffer(val, 'hex'), (err, res) => {
              oldGet_.apply(dbContext, remoteDBImporterArgs);
            });
          });
        }
      }]);
      oldGet_.apply(dbContext, remoteDBImporterArgs);
    }
  }

  initDb (db) {
    this.db = db;
  }

  getLastBlock (cb) {
    this.get((new Buffer('LastBlock')).toString('hex'), (err, res) => {
      cb(err, res);
    });
  }

  getBlockHeader (hash, cb) {
    this.get(BLOCK_HEX_PREFIX + hash + BLOCK_HEADER_HEX_SUFFIX, cb);
  }

  getBlockBody (hash, cb) {
    this.get(BLOCK_HEX_PREFIX + hash + BLOCK_BODY_HEX_SUFFIX, cb);
  }

  getBlockTD (hash, cb) {
    this.get(BLOCK_HEX_PREFIX + hash + BLOCK_TD_HEX_SUFFIX, cb);
  }

  portBlock (hash, cb) {
    this.getBlockHeader(hash, (err, encodedBlock) => {
      if(err) return cb(err);

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

  forkLatest(type, cb) {
    this.type = type;
    var that = this;
    async.waterfall([
      this.getLastBlock.bind(this),
      this.portBlock.bind(this)
      // this.getBlockHeader.bind(this)
    ], (err, b) => {
      if(err) return cb(err);

      this.portBlock(b.header.parentHash.toString('hex'), () => {
        cb(null, {
          branch: true,
          stateRoot: '0x'+b.header.stateRoot.toString('hex'),
          forkRoot: parseInt('0x'+b.header.number.toString('hex')),
          devmode: false,
          type: 'internal',
          network: type,
          fakedOwnership: ['0x0000000000000000000000000000000000000000'],
          defaultAccount: '0x0000000000000000000000000000000000000000',
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

  get(key, cb) {
    if(key.length >= 2 && key[1] === 'x') key = key.slice(2); // remove '0x' prefix

    // TODO - investigate why on fresh forked chain on dapple test a lookup happenes
    var post_req = http.request({
      host: this.uri.host,
      port: this.uri.port,
      method: 'POST',
      keepAlive: false,
      headers: {
        "Content-Type": "application/json"
      }
    }, function(res) {
      res.setEncoding('utf8');
      var data = "";
      res.on('data', function (chunk) {
        data += chunk;
      });
      res.on('end', function () {
        let ret = JSON.parse(data).result;
        if(ret.length >= 2 && ret[1] === 'x') {
          //remove 0x prefix
          ret = ret.slice(2);
        }
        cb(null, ret);
      });
    });

    // post the data
    post_req.write(`{"jsonrpc":"2.0","method":"debug_chaindbValue","params":["${key}"],"id":1}`);
    post_req.end();
  }

  close(cb) {
    if(typeof cb === 'function') cb();
  }

  get type() { return this._type; }

  set type(type) {
    switch (type) {
      case 'ETH':
        this._type = 'ETH';
        this.uri = {
          host: '107.170.127.70',
          port: '8545'
        };
        break;
      case 'ETC':
        throw new Error('MAKE ETC WORK WITH DAPPHUB');
        break;
      case 'MORDEN':
        this._type = 'MORDEN';
        this.uri = {
          host: '162.243.49.12',
          port: '8545'
        };
        break;
      default:
        throw new Error(`Cant fork chain type ${type}`);
    }
  }

}

module.exports = DapphubInterface;
