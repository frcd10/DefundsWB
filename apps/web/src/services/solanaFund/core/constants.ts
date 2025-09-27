import { PublicKey } from '@solana/web3.js';

export const PROGRAM_ID = new PublicKey(process.env.NEXT_PUBLIC_SOLANA_PROGRAM_ID || process.env.SOLANA_PROGRAM_ID || '11111111111111111111111111111111');

export const COMMITMENT = 'confirmed' as const;
