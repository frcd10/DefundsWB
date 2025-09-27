# Solana Fund Modular Service

This directory contains a modular refactor of the previous monolithic `solana-fund.service.ts` (>900 LOC). The original file now acts as a thin compatibility barrel that re-exports this implementation so no existing imports break.

## Structure

- `core/` – foundational pieces (IDL loading, program getter, constants)
- `types/` – shared TypeScript interfaces (fund params, fund model, validation context)
- `utils/pdas.ts` – PDA derivation helpers (single responsibility, testable)
- `fund/` – fund lifecycle & generic fund utilities
  - `createFund.ts` – initialize fund with optional initial deposit
  - `getFund.ts`, `getUserFunds.ts` – data retrieval placeholders
- `deposit/depositToFund.ts` – deposit flow (wrap SOL, invoke program)
- `payout/payFundInvestors.ts` – manager payout instruction construction
- `debug/debugVault.ts` – on-chain debug instruction convenience
- `index.ts` – orchestrator class `SolanaFundServiceModular` bundling public API

## Migration Notes

Import path stability is preserved:
```ts
import { solanaFundService } from '@/services/solana-fund.service'; // still works
```
Internally this now re-exports `solanaFundServiceModular`.

Prefer new direct imports for future code:
```ts
import { solanaFundServiceModular } from '@/services/solanaFund';
```

## Adding New Features

1. Create a new domain folder if needed (e.g. `withdraw/withdrawFromFund.ts`).
2. Export the function from that file with a focused responsibility.
3. Wire it through `index.ts` by adding a delegating method on `SolanaFundServiceModular`.
4. (Optional) Provide pure helpers in `utils/` if logic can be shared.

## Testing Ideas

- Unit test PDA helpers (deterministic output for known inputs)
- Mock `Connection` & `wallet` for deposit/payout flows
- Add a thin integration smoke test that runs `createFund` then `depositToFund` on devnet (behind an env flag)

## Future Improvements

- Implement real `getFund` / `getUserFunds` backed by backend API + caching
- Add withdrawal implementation (currently placeholder in legacy file only)
- Centralize error translation layer for consistent UX messages

---
Feel free to iterate; small focused files keep merge conflicts low and readability high.
