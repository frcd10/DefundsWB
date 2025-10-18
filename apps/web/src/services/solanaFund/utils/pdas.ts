import { PublicKey } from '@solana/web3.js';

export function deriveFundPda(programId: PublicKey, manager: PublicKey, name: string) {
  return PublicKey.findProgramAddressSync([
    Buffer.from('fund'),
    manager.toBuffer(),
    Buffer.from(name)
  ], programId);
}

export function deriveVaultPda(programId: PublicKey, fund: PublicKey) {
  return PublicKey.findProgramAddressSync([
    Buffer.from('vault'),
    fund.toBuffer()
  ], programId);
}

export function deriveSharesMintPda(programId: PublicKey, fund: PublicKey) {
  return PublicKey.findProgramAddressSync([
    Buffer.from('shares'),
    fund.toBuffer()
  ], programId);
}

export function deriveInvestorPositionPda(programId: PublicKey, investor: PublicKey, fund: PublicKey) {
  return PublicKey.findProgramAddressSync([
    Buffer.from('position'),
    investor.toBuffer(),
    fund.toBuffer()
  ], programId);
}

export function deriveWithdrawalPda(programId: PublicKey, fund: PublicKey, investor: PublicKey) {
  return PublicKey.findProgramAddressSync([
    Buffer.from('withdrawal'),
    fund.toBuffer(),
    investor.toBuffer()
  ], programId);
}

export function deriveVaultSolPda(programId: PublicKey, fund: PublicKey) {
  return PublicKey.findProgramAddressSync([
    Buffer.from('vault_sol'),
    fund.toBuffer()
  ], programId);
}

export function deriveTempWsolPda(programId: PublicKey, fund: PublicKey) {
  return PublicKey.findProgramAddressSync([
    Buffer.from('vault_sol_temp'),
    fund.toBuffer()
  ], programId);
}
