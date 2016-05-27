"use strict";
var DappleChain = require('./blockchain.js');
var Formatters = require('./formatters.js');

module.exports = {

  cli: function (cli, workspace) {
    if(cli.status) {
      this.status(cli, workspace);
    } else if(cli.branch) {
      this.branch(cli, workspace);
    } else if(cli.fork) {
      this.fork(cli, workspace);
    } else if(cli.checkout) {
      this.checkout(cli, workspace);
    } else if(cli.log) {
      this.log(cli, workspace);
    }
  },

  status: function (cli, workspace) {
    // console.log(workspace);
    var dapplechain = new DappleChain({
      packageRoot: workspace.package_root
    }, {});
    console.log(Formatters.status(dapplechain.state));
  },

  branch: function (cli, workspace) {
    var dapplechain = new DappleChain({
      packageRoot: workspace.package_root
    }, {});
    console.log(Formatters.branch(dapplechain.state));
  },

  fork: function (cli, workspace) {
    var dapplechain = new DappleChain({
      packageRoot: workspace.package_root
    }, {});
    dapplechain.fork(cli['<name>']);
  },

  checkout: function (cli, workspace) {
    var dapplechain = new DappleChain({
      packageRoot: workspace.package_root
    }, {});
    dapplechain.checkout(cli['<name>']);
  },

  log: function (cli, workspace) {
    var dapplechain = new DappleChain({
      packageRoot: workspace.package_root
    }, {});
    dapplechain.log();
  }

};
