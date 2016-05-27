"use strict";

module.exports = {
  /* Prints out dapple chains status nicely
   *
   * @param state state object
   *  - genesis: genesis hash
   *  - height: block height
   */
  status: function (state) {
    console.log(JSON.stringify(state, false, 2));
    let env = state.pointers[state.head];
    return `genesis: ${env.meta.genesis}
stateRoot: ${env.stateRoot}

branch: ${state.head}

fork root: ${env.forkRoot}
height: ${env.meta.height}

pending transactions: (TODO)
1. 0x0123..df:  0xfdbc..10 -.> 0xf31c..34
2. ...
3. <TX_HASH>: <FROM> --> [ <TO> ]
`;
  },
  branch: function (state) {
    return Object.keys(state.pointers)
      .map((name) => ` ${name===state.head?'*':' '} ${name}`)
      .join('\n');
  }
};
