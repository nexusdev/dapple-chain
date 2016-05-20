"use strict";
var DappleChain = require('./blockchain.js');
var Formatters = require('./formatters.js');

module.exports = {

  cli: function (cli, workspace) {
    if(cli.status) {
      this.status(cli, workspace);
    } else if(cli.branch) {
      this.branch(cli, workspace)
    }
  },

  status: function (cli, workspace) {
    // console.log(workspace);
    var dapplechain = new DappleChain({
      packageRoot: workspace.package_root
    }, {});
    console.log(Formatters.status({
      genesis: dapplechain.state.genesis,
      height: dapplechain.state.height
    }));
  },

  branch: function (cli, workspace) {
    var dapplechain = new DappleChain({
      packageRoot: workspace.package_root
    }, {});
  }

};
