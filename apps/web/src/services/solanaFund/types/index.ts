import { Idl } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';

export interface CreateFundParams {
  name: string;
  description: string;
  fundType: string;
  performanceFee: number; // expressed in % (e.g. 10 => 10%)
  maxCapacity: number;
  isPublic: boolean;
  initialDeposit: number; // in SOL
}

export interface SolanaFund {
  id: string;
  manager: string;
  name: string;
  description: string;
  fundType: string;
  totalDeposits: number;
  totalShares: number;
  performanceFee: number;
  maxCapacity: number;
  isPublic: boolean;
  createdAt: number;
  userShare?: number;
  userSharePercentage?: number;
}

export interface ValidatedFundContext {
  fundPk: PublicKey;
  managerPk: PublicKey;
  vault: PublicKey;
  baseMint: PublicKey;
  vaultSolPda: PublicKey;
  tempWsolPda: PublicKey;
  decoded: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface LoadIdlFn {
  (): Promise<Idl>;
}
