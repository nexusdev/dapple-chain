"use strict";

module.exports = {
  /* Prints out dapple chains status nicely
   *
   * @param state state object
   *  - genesis: genesis hash
   *  - height: block height
   */
  status: function (state) {
    return `genesis: ${state.genesis}
fork root: 0
height: ${state.height}

branch: master (TODO)

pending transactions: (TODO)
1. 0x0123..df:  0xfdbc..10 -.> 0xf31c..34
2. ...
3. <TX_HASH>: <FROM> --> [ <TO> ]
`;
  }
};
