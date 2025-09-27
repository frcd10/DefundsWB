import { SolanaFund } from '../types';

export async function getFund(_connection: any, fundId: string): Promise<SolanaFund | null> {
  console.log('Fetching fund:', fundId);
  return null;
}
