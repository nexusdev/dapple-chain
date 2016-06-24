# Dapple Chain - WIP
This is an ongoing WIP project.

### Requirements
We need to have a way to navigate through the chain-state to allow the user to:

1.  R01: switch between environments and chain states
2.  R02: tag chain states
3.  R03: explore the partial state history
4.  R04: adding transactions and blocks to head
5.  R05: manipulate the history for testing purposes
6.  R06: commit transactions and blocks
7.  R07: fork chains
8.  R08: sync with the current chain state
9.  R09: publish selected transactions and blocks to another blockchain
10. R10: show info about the current state

### Naming
The underlaying data structure is a DAG which has similarities to git, therefore the terminology could be applied analogous:

1. checkout
2. branches, tags, head, fork-root
3. log, [step?], [inspect?]
4. stage, add, rm
5. rebase, (maybe new terminology is needed)
6. commit
7. fork
8. pull OR fetch OR sync
9. publish OR push
10. status

### Details
#### Architecture
Much like git the data structure is immutable. It has a default HEAD which is pointing to the root hash of the merkle-trie along with the current metadata state. Apart from this there are tags and branches pointing to root hashes along with their metadata. Like in git tags are static, and branches move with HEAD.


#### Terminology

* transaction
  * marked: A transaction can be marked if the user want it to be included in the future state merge [(R09)](#R09)
* state node: node in the DAG, represents a transaction or a block with metadata as described in [State](#### State)


#### State
* operation - last executed operation, such as adding a block or a transaction
    * transaction:
        * _id: continuous counter which identifies the transaction
        * marked: indicates wether the transaction should be included into the next state merge
* root:
    * last_block: pointer to the last block
    * tx_state: points to the current transaction
* fork_root: points to the block, where the chain got forked of the main chain
* last_fork: points to the block of the last fork
* environment: **TODO**

**TODO:** - merge environment data in here

#### 1. checkout
**Usage:**
* switch branches:
```
$ dapple checkout test/updateComponentA
```
* forget about all pending transactions on the current head:
```
$ dapple checkout head
```

#### 2. branch
**Usage:**
```
$ dapple branch
  livenet          #1232
* testDeploy       #1235
  oldState         #742
  <NAME>           <BLOCK_HEIGHT>
```


#### 03. log
**Usage:**
```
$ dapple log
fork root: #101
1. 0x0123..df:  0xdbcb..10 --> 0x31cf..34
...
4. 0x1234..cd:  0xbcba..21 --> 0x1cf3..45

#102 -- SOMETAG
5. 0x2345..bc:  0xcba9..32 --> 0xcf31..56

#103 -- HEAD
6. 0x3456..ab:  0xba98..43 --> 0xf31e..45

$ dapple log --all
fork root: #101 0xa4f..18
1. 0x0123..df:  0xdbcb..10 --> 0x31cf..34               x
...
4. 0x1234..cd:  0xbcba..21 --> 0x1cf3..45               x

#102 -- SOMETAG
5. 0x2345..bc:  0xcba9..32 --> 0xcf31..56

#103 -- HEAD
6. 0x3456..ab:  0xba98..43 --> 0xf31e..45               x
```
x - mark committed transactions

#### 04. stage/ add/ rm
* add transaction
adding transactions is done implicitly via DappleScript or rpc chain interaction
* add block
```
$ dapple block add
added 1 transaction to block height #104
1. 0x3456..ab:  0xba98..43 --> 0xf31e..45
```
* removing:
Since removing transactions or blocks alters the history **R05** should be used for this purpose instead

**TODO 04:** - maybe some sort of interactive repl for DappleScript is suitable to "experiment" with the state

#### 05. rebase
Changes the history of the chain.
* removing a transaction
Removes a transaction and tries to restore the state after applying each relevant transaction from the change to the current head state root
**Usage:**
```
dapple <rebase> remove 0xba98..43
SUCCESS: consistent state after 12 transactions
```
* tx manipulation
    * change origin
    * change data
    * change value
    * change gas


**TODO 05:**
1. a better name is needed
2. do we need something interactive (repl) instead here?
3. what are valid manipulations?

#### 06. commit
Marks transaction as final/ to commit on sync
**Usage:**
```
dapple commit 2-3 5
```

#### 07. fork
fork the current head
```
$ dapple fork test/updateComponentA
```

#### 08. pull/ fetch/ sync
tries to update your current state to the given remote state.
**Usage:**
```
dapple pull livenet
SUCCESS: cinsistent state after syncing 12032 Blocks
```

#### 09. publish
publishes all marked transactions from the fork root to the current HEAD block in sequence to the given chain
```
dapple publish livenet
...
SIMULATED SUCCESSFUL
...
...
SCCESS: published 14 transactions in 5 Blocks from block 1203322 to 1203345
GAS: 12.332.256 gas
```

#### 10. stauts
**Usage:**
```
$ dapple status
fork root: #101
last block: #103
pending transactions:
1. 0x0123..df:  0xfdbc..10 -.> 0xf31c..34
2. ...
3. <TX_HASH>: <FROM> --> [ <TO> ]
```
**TODO 10:** what information do we need here?


