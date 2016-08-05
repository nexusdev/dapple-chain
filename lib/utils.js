var utils = require('ethereumjs-util');

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
  }
};
