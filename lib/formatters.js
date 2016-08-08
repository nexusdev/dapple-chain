"use strict";
var _ = require('lodash');

module.exports = {
  /* Prints out dapple chains status nicely
   *
   * @param state state object
   *  - genesis: genesis hash
   *  - height: block height
   */
  status: function (state) {
    // console.log(JSON.stringify(state, false, 2));
    let env = state.pointers[state.head];
    let specific = '';
    let faked = '';

    if(env.type === 'internal') {
      let dHeight = env.meta.height - env.forkRoot;
      specific = `fork root: ${env.forkRoot}
height: +${dHeight} ${env.devmode?'(dev)':''}`;
      faked = `faked accounts:
${env.fakedOwnership.join('\n')}\n`;
    } else {
      specific = `type: ${env.type}
uri: ${env.network.host}:${env.network.port}`;
    }

    let context = _.map(env.env, (e, name) => `${name} = ${e.value} :: ${e.type}`)
    .join('\n');

    return `Chain: ${state.head}

${specific}

default account:
${env.defaultAccount}

${faked}
Context:
${context}

${JSON.stringify(env, false, 2)}
`;
// pending transactions: (TODO)
// 1. 0x0123..df:  0xfdbc..10 -.> 0xf31c..34
// 2. ...
// 3. <TX_HASH>: <FROM> --> [ <TO> ]
  },
  list: function (state) {
    let max = Object.keys(state.pointers)
    .map(name => ' '.repeat(name.length))
    .reduce((a, b) => a.length > b.length?a:b, '');

    let internal = Object.keys(state.pointers)
      .filter(name => state.pointers[name].type === 'internal')
      .map((name) => ` ${name===state.head?'*':' '} ${name} ${max.slice(0,-name.length)} #${state.pointers[name].meta.height}`)
      .join('\n');

    let external = Object.keys(state.pointers)
      .filter(name => state.pointers[name].type !== 'internal')
      .map((name) => ` ${name===state.head?'*':' '} ${name} ${max.slice(0,-name.length)} (${state.pointers[name].type})`)
      .join('\n');

    return internal + '\n' + external;

  },
  txMedium: function (tx) {
    return `${tx.from.toString('hex')} --> ${tx.to.toString('hex')} (${parseInt(tx.value.toString('hex')) || 0})`;
  },
  blockMedium: function (b) {
    return `Block #${parseInt('0x'+b.header.number.toString('hex'))}`;
  }

};
