var utils = require('ethereumjs-util');
var createNewChain = require('./createNewChain.js');
var DapphubInterface = require('./dapphubInterface.js');

module.exports = {
  optionalCallback: function (cb) {
      if (typeof(cb) == 'undefined') {
          return function (err, val) { return err ? err : val; }
      }
      return cb;
  },
  toHex: function (val) {
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
  },
  initNew: (db, accounts, callback) => {
    createNewChain(db, accounts, (err, chaindata) => {
      if(err) throw err;
      var chainenv = {
        branch: true,
        meta: chaindata.meta,
        stateRoot: chaindata.stateRoot,
        env: {},
        fakedOwnership: ['0x0000000000000000000000000000000000000000'],
        defaultAccount: '0x0000000000000000000000000000000000000000',
        devmode: true,
        type: "internal"
      };
      callback(null, chainenv);
    });
  },
  forkLiveChain: (db, type, callback) => {
    var dhInterface = new DapphubInterface();
    dhInterface.initDb(db);
    dhInterface.forkLatest(type, callback);
  }

};
