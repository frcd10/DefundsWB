// Deprecated monolithic service file.
// This now re-exports the new modular implementation located in ./solanaFund
// to avoid breaking existing import paths in the codebase.
// Gradually migrate imports to: `import { solanaFundServiceModular } from './solanaFund'`.

export * from './solanaFund/types';
export { solanaFundServiceModular as solanaFundService, SolanaFundServiceModular as SolanaFundService } from './solanaFund';
