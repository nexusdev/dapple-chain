"use strict";
var _ = require('lodash');

// {
//   "name": "restore",
//   "options": [
//     {
//       "name": "[--eth=<uri>]",
//       "summary": "URI of rpc endpoint"
//     },
//     {
//       "name": "[--etc=<uri>]",
//       "summary": "URI of rpc endpoint"
//     },
//     {
//       "name": "[--morden=<uri>]",
//       "summary": "URI of rpc endpoint"
//     }
//   ]
// }

module.exports = (cli, state) => {
  var uris = {};
  var addUri = (type) => {
    var u = type.toUpperCase();
    if(cli['--'+type]) {
      uris[u] = {
        host: cli['--'+type].split(':')[0],
        port: cli['--'+type].split(':')[1],
      };
    }
  }
  addUri('eth');
  addUri('etc');
  addUri('morden');

  var dappfile = state.workspace.dappfile;
  _.each(dappfile.environments, (env, name) => {
    var type = env.type.toUpperCase();
    if( !(type in uris) ) return null;
    if(type === 'MORDEN' || type === 'ETH' || type === 'ETC') {
      state.state.pointers[name] = _.assign( state.state.pointers[name], {
        branch: false,
        network: uris[type],
        type: env.type,
        defaultAccount: '0x0',
        devmode: false,
        confirmationBlocks: 1
      });
      console.log(`restored chain ${name}`);
    } else {
      console.log(`could not restore chain ${name} :: ${type}`);
    }
    state.saveState(true);
  });
}
