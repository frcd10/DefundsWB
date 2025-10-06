/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/managed_funds.json`.
 */
export type ManagedFunds = {
  "address": "3dHDaKpa5aLMwimWJeBihqwQyyHpR6ky7NNDPtv7QFYt",
  "metadata": {
    "name": "managedFunds",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Solana program for managed funds"
  },
  "instructions": [
    {
      "name": "authorizeDefundSwap",
      "docs": [
        "Authorize a Jupiter swap: approve manager as delegate on the vault for amount_in."
      ],
      "discriminator": [
        140,
        86,
        101,
        151,
        183,
        161,
        120,
        176
      ],
      "accounts": [
        {
          "name": "fund",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  117,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "fund.manager",
                "account": "fund"
              },
              {
                "kind": "account",
                "path": "fund.name",
                "account": "fund"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "fund"
              }
            ]
          }
        },
        {
          "name": "manager",
          "writable": true,
          "signer": true,
          "relations": [
            "fund"
          ]
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "inputMint",
          "type": "pubkey"
        },
        {
          "name": "amountIn",
          "type": "u64"
        }
      ]
    },
    {
      "name": "debugVault",
      "docs": [
        "Debug vault state (manager only). Prints owner, size, token fields if possible."
      ],
      "discriminator": [
        67,
        35,
        119,
        52,
        81,
        102,
        31,
        188
      ],
      "accounts": [
        {
          "name": "manager",
          "writable": true,
          "signer": true,
          "relations": [
            "fund"
          ]
        },
        {
          "name": "fund",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  117,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "fund.manager",
                "account": "fund"
              },
              {
                "kind": "account",
                "path": "fund.name",
                "account": "fund"
              }
            ]
          }
        },
        {
          "name": "vault",
          "docs": [
            "Vault PDA (may or may not be a valid token account)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "fund"
              }
            ]
          }
        },
        {
          "name": "baseMint",
          "docs": [
            "Base mint for context"
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "deposit",
      "docs": [
        "Deposit into a fund"
      ],
      "discriminator": [
        242,
        35,
        198,
        137,
        82,
        225,
        242,
        182
      ],
      "accounts": [
        {
          "name": "fund",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  117,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "fund.manager",
                "account": "fund"
              },
              {
                "kind": "account",
                "path": "fund.name",
                "account": "fund"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "fund"
              }
            ]
          }
        },
        {
          "name": "sharesMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  104,
                  97,
                  114,
                  101,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "fund"
              }
            ]
          }
        },
        {
          "name": "investorPosition",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "investor"
              },
              {
                "kind": "account",
                "path": "fund"
              }
            ]
          }
        },
        {
          "name": "investorTokenAccount",
          "writable": true
        },
        {
          "name": "investorSharesAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "investor"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "sharesMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "investor",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "executeTrade",
      "docs": [
        "Execute a trade (only fund manager)"
      ],
      "discriminator": [
        77,
        16,
        192,
        135,
        13,
        0,
        106,
        97
      ],
      "accounts": [
        {
          "name": "fund",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  117,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "fund.manager",
                "account": "fund"
              },
              {
                "kind": "account",
                "path": "fund.name",
                "account": "fund"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "fund"
              }
            ]
          }
        },
        {
          "name": "trade",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  97,
                  100,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "fund"
              },
              {
                "kind": "arg",
                "path": "inputMint"
              },
              {
                "kind": "arg",
                "path": "outputMint"
              }
            ]
          }
        },
        {
          "name": "manager",
          "writable": true,
          "signer": true,
          "relations": [
            "fund"
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "inputMint",
          "type": "pubkey"
        },
        {
          "name": "outputMint",
          "type": "pubkey"
        },
        {
          "name": "amountIn",
          "type": "u64"
        },
        {
          "name": "minimumAmountOut",
          "type": "u64"
        }
      ]
    },
    {
      "name": "finalizeWithdrawal",
      "docs": [
        "Finalize withdrawal and distribute SOL"
      ],
      "discriminator": [
        178,
        87,
        206,
        68,
        201,
        186,
        164,
        232
      ],
      "accounts": [
        {
          "name": "fund",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  117,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "fund.manager",
                "account": "fund"
              },
              {
                "kind": "account",
                "path": "fund.name",
                "account": "fund"
              }
            ]
          },
          "relations": [
            "investorPosition"
          ]
        },
        {
          "name": "investorPosition",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "investor"
              },
              {
                "kind": "account",
                "path": "fund"
              }
            ]
          }
        },
        {
          "name": "sharesMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  104,
                  97,
                  114,
                  101,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "fund"
              }
            ]
          }
        },
        {
          "name": "investorSharesAccount",
          "writable": true
        },
        {
          "name": "withdrawalState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  105,
                  116,
                  104,
                  100,
                  114,
                  97,
                  119,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "fund"
              },
              {
                "kind": "account",
                "path": "investor"
              }
            ]
          }
        },
        {
          "name": "vaultSolAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  115,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "fund"
              }
            ]
          }
        },
        {
          "name": "investor",
          "writable": true,
          "signer": true,
          "relations": [
            "investorPosition",
            "withdrawalState"
          ]
        },
        {
          "name": "trader"
        },
        {
          "name": "treasury"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initializeFund",
      "docs": [
        "Initialize a new fund vault"
      ],
      "discriminator": [
        212,
        42,
        24,
        245,
        146,
        141,
        78,
        198
      ],
      "accounts": [
        {
          "name": "fund",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  117,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "manager"
              },
              {
                "kind": "arg",
                "path": "name"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "fund"
              }
            ]
          }
        },
        {
          "name": "sharesMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  104,
                  97,
                  114,
                  101,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "fund"
              }
            ]
          }
        },
        {
          "name": "baseMint"
        },
        {
          "name": "manager",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "name",
          "type": "string"
        },
        {
          "name": "description",
          "type": "string"
        },
        {
          "name": "managementFee",
          "type": "u16"
        },
        {
          "name": "performanceFee",
          "type": "u16"
        }
      ]
    },
    {
      "name": "initiateWithdrawal",
      "docs": [
        "Initiate a withdrawal with position liquidation"
      ],
      "discriminator": [
        69,
        216,
        131,
        74,
        114,
        122,
        38,
        112
      ],
      "accounts": [
        {
          "name": "fund",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  117,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "fund.manager",
                "account": "fund"
              },
              {
                "kind": "account",
                "path": "fund.name",
                "account": "fund"
              }
            ]
          },
          "relations": [
            "investorPosition"
          ]
        },
        {
          "name": "investorPosition",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "investor"
              },
              {
                "kind": "account",
                "path": "fund"
              }
            ]
          }
        },
        {
          "name": "withdrawalState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  105,
                  116,
                  104,
                  100,
                  114,
                  97,
                  119,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "fund"
              },
              {
                "kind": "account",
                "path": "investor"
              }
            ]
          }
        },
        {
          "name": "investor",
          "writable": true,
          "signer": true,
          "relations": [
            "investorPosition"
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "sharesToWithdraw",
          "type": "u64"
        }
      ]
    },
    {
      "name": "investorFundWithdrawal",
      "docs": [
        "Investor withdraws full participation (SOL-only devnet path), taking platform and performance fees."
      ],
      "discriminator": [
        165,
        14,
        180,
        222,
        163,
        115,
        240,
        32
      ],
      "accounts": [
        {
          "name": "investor",
          "writable": true,
          "signer": true,
          "relations": [
            "investorPosition"
          ]
        },
        {
          "name": "fund",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  117,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "fund.manager",
                "account": "fund"
              },
              {
                "kind": "account",
                "path": "fund.name",
                "account": "fund"
              }
            ]
          },
          "relations": [
            "investorPosition"
          ]
        },
        {
          "name": "investorPosition",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "investor"
              },
              {
                "kind": "account",
                "path": "fund"
              }
            ]
          }
        },
        {
          "name": "vaultSolAccount",
          "docs": [
            "PDA that holds SOL for the fund"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  115,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "fund"
              }
            ]
          }
        },
        {
          "name": "manager",
          "writable": true
        },
        {
          "name": "treasury",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "liquidatePositionsBatch",
      "docs": [
        "Liquidate positions in batches during withdrawal"
      ],
      "discriminator": [
        43,
        74,
        177,
        136,
        121,
        84,
        245,
        173
      ],
      "accounts": [
        {
          "name": "withdrawalState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  105,
                  116,
                  104,
                  100,
                  114,
                  97,
                  119,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "fund"
              },
              {
                "kind": "account",
                "path": "investor"
              }
            ]
          }
        },
        {
          "name": "fund",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  117,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "fund.manager",
                "account": "fund"
              },
              {
                "kind": "account",
                "path": "fund.name",
                "account": "fund"
              }
            ]
          }
        },
        {
          "name": "investor",
          "writable": true,
          "signer": true,
          "relations": [
            "withdrawalState"
          ]
        }
      ],
      "args": [
        {
          "name": "positionIndices",
          "type": "bytes"
        },
        {
          "name": "minimumAmountsOut",
          "type": {
            "vec": "u64"
          }
        }
      ]
    },
    {
      "name": "payFundInvestors",
      "docs": [
        "Distribute SOL from vault to investors by share percentage, taking platform and performance fees."
      ],
      "discriminator": [
        106,
        88,
        202,
        106,
        90,
        54,
        97,
        75
      ],
      "accounts": [
        {
          "name": "manager",
          "writable": true,
          "signer": true,
          "relations": [
            "fund"
          ]
        },
        {
          "name": "fund",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  117,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "fund.manager",
                "account": "fund"
              },
              {
                "kind": "account",
                "path": "fund.name",
                "account": "fund"
              }
            ]
          }
        },
        {
          "name": "vaultSolAccount",
          "docs": [
            "PDA that holds SOL for the fund"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  115,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "fund"
              }
            ]
          }
        },
        {
          "name": "vault",
          "docs": [
            "SPL vault that holds WSOL when base_mint is the native mint"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "fund"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "baseMint",
          "docs": [
            "Base mint (must be NATIVE_MINT for WSOL unwrapping path)"
          ]
        },
        {
          "name": "tempWsolAccount",
          "docs": [
            "Temporary WSOL token account PDA (created and closed within this ix)"
          ],
          "writable": true
        },
        {
          "name": "treasury",
          "docs": [
            "Treasury wallet for platform fees"
          ],
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "totalAmount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "payRwaInvestors",
      "docs": [
        "Pay RWA investors with a single CPI fan-out from manager signer"
      ],
      "discriminator": [
        153,
        150,
        48,
        178,
        251,
        111,
        229,
        90
      ],
      "accounts": [
        {
          "name": "manager",
          "docs": [
            "Manager must authorize payouts (matches current client flow; funds come from manager wallet)"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "docs": [
            "System program for lamports transfer CPI"
          ],
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amounts",
          "type": {
            "vec": "u64"
          }
        }
      ]
    },
    {
      "name": "revokeDefundSwap",
      "docs": [
        "Revoke Jupiter swap authorization: remove delegate from the vault."
      ],
      "discriminator": [
        225,
        81,
        242,
        46,
        188,
        211,
        73,
        14
      ],
      "accounts": [
        {
          "name": "fund",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  117,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "fund.manager",
                "account": "fund"
              },
              {
                "kind": "account",
                "path": "fund.name",
                "account": "fund"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "fund"
              }
            ]
          }
        },
        {
          "name": "manager",
          "writable": true,
          "signer": true,
          "relations": [
            "fund"
          ]
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "updateFund",
      "docs": [
        "Update fund settings (only fund manager)"
      ],
      "discriminator": [
        132,
        171,
        13,
        83,
        34,
        122,
        82,
        155
      ],
      "accounts": [
        {
          "name": "fund",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  117,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "fund.manager",
                "account": "fund"
              },
              {
                "kind": "account",
                "path": "fund.name",
                "account": "fund"
              }
            ]
          }
        },
        {
          "name": "manager",
          "signer": true,
          "relations": [
            "fund"
          ]
        }
      ],
      "args": [
        {
          "name": "name",
          "type": {
            "option": "string"
          }
        },
        {
          "name": "description",
          "type": {
            "option": "string"
          }
        },
        {
          "name": "managementFee",
          "type": {
            "option": "u16"
          }
        },
        {
          "name": "performanceFee",
          "type": {
            "option": "u16"
          }
        }
      ]
    },
    {
      "name": "withdraw",
      "docs": [
        "Withdraw from a fund"
      ],
      "discriminator": [
        183,
        18,
        70,
        156,
        148,
        109,
        161,
        34
      ],
      "accounts": [
        {
          "name": "fund",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  117,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "fund.manager",
                "account": "fund"
              },
              {
                "kind": "account",
                "path": "fund.name",
                "account": "fund"
              }
            ]
          },
          "relations": [
            "investorPosition"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "fund"
              }
            ]
          }
        },
        {
          "name": "sharesMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  104,
                  97,
                  114,
                  101,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "fund"
              }
            ]
          }
        },
        {
          "name": "investorPosition",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "investor"
              },
              {
                "kind": "account",
                "path": "fund"
              }
            ]
          }
        },
        {
          "name": "investorTokenAccount",
          "writable": true
        },
        {
          "name": "investorSharesAccount",
          "writable": true
        },
        {
          "name": "investor",
          "writable": true,
          "signer": true,
          "relations": [
            "investorPosition"
          ]
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "fund",
      "discriminator": [
        62,
        128,
        183,
        208,
        91,
        31,
        212,
        209
      ]
    },
    {
      "name": "investorPosition",
      "discriminator": [
        145,
        143,
        236,
        150,
        229,
        40,
        195,
        88
      ]
    },
    {
      "name": "trade",
      "discriminator": [
        132,
        139,
        123,
        31,
        157,
        196,
        244,
        190
      ]
    },
    {
      "name": "withdrawalState",
      "discriminator": [
        147,
        152,
        68,
        7,
        82,
        25,
        255,
        177
      ]
    }
  ],
  "events": [
    {
      "name": "defundSwapAuthorized",
      "discriminator": [
        231,
        171,
        204,
        134,
        19,
        178,
        94,
        19
      ]
    },
    {
      "name": "defundSwapRevoked",
      "discriminator": [
        250,
        155,
        6,
        109,
        18,
        135,
        219,
        176
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "unauthorized",
      "msg": "Unauthorized: Only fund manager can perform this action"
    },
    {
      "code": 6001,
      "name": "invalidFee",
      "msg": "Invalid fee: Fee exceeds maximum allowed"
    },
    {
      "code": 6002,
      "name": "insufficientFunds",
      "msg": "Insufficient funds in vault"
    },
    {
      "code": 6003,
      "name": "invalidAmount",
      "msg": "Invalid amount: Amount must be greater than zero"
    },
    {
      "code": 6004,
      "name": "invalidShares",
      "msg": "Invalid shares: Shares amount is invalid"
    },
    {
      "code": 6005,
      "name": "fundPaused",
      "msg": "Fund is paused"
    },
    {
      "code": 6006,
      "name": "invalidMint",
      "msg": "Invalid mint: Token mint is not supported"
    },
    {
      "code": 6007,
      "name": "slippageExceeded",
      "msg": "Slippage exceeded: Minimum amount out not met"
    },
    {
      "code": 6008,
      "name": "tradeFailed",
      "msg": "Trade failed: External trade execution failed"
    },
    {
      "code": 6009,
      "name": "mathOverflow",
      "msg": "Math overflow"
    },
    {
      "code": 6010,
      "name": "invalidWithdrawalStatus",
      "msg": "Invalid withdrawal status"
    },
    {
      "code": 6011,
      "name": "invalidInput",
      "msg": "Invalid input parameters"
    }
  ],
  "types": [
    {
      "name": "defundSwapAuthorized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "fund",
            "type": "pubkey"
          },
          {
            "name": "manager",
            "type": "pubkey"
          },
          {
            "name": "inputMint",
            "type": "pubkey"
          },
          {
            "name": "amountIn",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "defundSwapRevoked",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "fund",
            "type": "pubkey"
          },
          {
            "name": "manager",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "fund",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "manager",
            "type": "pubkey"
          },
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "description",
            "type": "string"
          },
          {
            "name": "baseMint",
            "type": "pubkey"
          },
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "sharesMint",
            "type": "pubkey"
          },
          {
            "name": "managementFee",
            "type": "u16"
          },
          {
            "name": "performanceFee",
            "type": "u16"
          },
          {
            "name": "totalShares",
            "type": "u64"
          },
          {
            "name": "totalAssets",
            "type": "u64"
          },
          {
            "name": "lastFeeCollection",
            "type": "i64"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "vaultBump",
            "type": "u8"
          },
          {
            "name": "sharesBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "investorPosition",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "investor",
            "type": "pubkey"
          },
          {
            "name": "fund",
            "type": "pubkey"
          },
          {
            "name": "shares",
            "type": "u64"
          },
          {
            "name": "initialInvestment",
            "type": "u64"
          },
          {
            "name": "totalDeposited",
            "type": "u64"
          },
          {
            "name": "totalWithdrawn",
            "type": "u64"
          },
          {
            "name": "firstDepositAt",
            "type": "i64"
          },
          {
            "name": "lastActivityAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "trade",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "fund",
            "type": "pubkey"
          },
          {
            "name": "trader",
            "type": "pubkey"
          },
          {
            "name": "tradeType",
            "type": {
              "defined": {
                "name": "tradeType"
              }
            }
          },
          {
            "name": "inputMint",
            "type": "pubkey"
          },
          {
            "name": "outputMint",
            "type": "pubkey"
          },
          {
            "name": "amountIn",
            "type": "u64"
          },
          {
            "name": "amountOut",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          },
          {
            "name": "signature",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "tradeType",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "buy"
          },
          {
            "name": "sell"
          }
        ]
      }
    },
    {
      "name": "withdrawalState",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "investor",
            "type": "pubkey"
          },
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "sharesToWithdraw",
            "type": "u64"
          },
          {
            "name": "positionsLiquidated",
            "type": "u8"
          },
          {
            "name": "totalPositions",
            "type": "u8"
          },
          {
            "name": "solAccumulated",
            "type": "u64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "withdrawalStatus"
              }
            }
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "withdrawalStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "initiated"
          },
          {
            "name": "liquidating"
          },
          {
            "name": "readyToFinalize"
          },
          {
            "name": "completed"
          },
          {
            "name": "failed"
          }
        ]
      }
    }
  ]
};
