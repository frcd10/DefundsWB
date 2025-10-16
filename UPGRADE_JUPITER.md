# Jupiter CPI Upgrade Playbook

This document describes the controlled process for upgrading the vendored / pinned Jupiter CPI integration while maintaining compatibility and safety.

## 1. Current Snapshot
- Anchor version: 0.31.1
- Jupiter program ID: JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4
- Dependency style: (pending decision) upstream git or local vendored copy
- Supported route type: Single-hop Shared Accounts Route (no token ledger)
- Label mapping: Raydium, Whirlpool/Orca, Saber, Meteora (reject others)

## 2. Rationale for Pinning
Pinning avoids unexpected semantic changes (enum ordering, struct shape) that could break Borsh encoding assumptions and produce invalid CPIs. We only move forward when the new IDL / crate is explicitly reviewed.

## 3. Upgrade Steps
1. Fetch upstream repo:
   - `git clone https://github.com/jup-ag/jupiter-cpi` (or pull latest)
2. Identify target commit / tag to upgrade to.
3. Diff IDL:
   - Compare `idl.json` (in upstream) hash to local stored copy (compute SHA256).
   - If changed, inspect differences: new instructions? modified fields? removed variants?
4. Enum / Struct Integrity:
   - Confirm ordering of `Swap` enum variants unchanged (critical for Borsh variant index).
   - Confirm `RoutePlanStep` field order unchanged.
5. Build a temporary test crate:
   - Add both old and new versions (rename package of one via `[package] name =` modification) to compare encodings.
   - Serialize a canonical sample (one variant of each) and assert byte equality if structure unchanged.
6. Update dependency in `Cargo.toml` (path or git rev).
7. `anchor clean && anchor build`.
8. Run local integration test:
   - Execute `swap_tokens_shared` with a small amount on mainnet (dry-run or small amount) to validate logs.
9. Update docs:
   - Record new commit hash and IDL hash in this file.
10. Deploy program upgrade.

## 4. Rollback Plan
If post-upgrade tests fail:
- Revert the Cargo.toml change (previous commit hash).
- Rebuild & redeploy previous binary.
- Investigate logs / diff.

## 5. Adding New AMM Labels
When a quote introduces a new label:
- Add mapping entry in `map_label_to_swap_variant`.
- Deploy with same process above.
- Keep a NOT MAPPED log counter off-chain to alert on repeated unknown labels.

## 6. Multi-hop Future Feature
When enabling multi-hop:
- Introduce a feature flag `multi-hop` in `Cargo.toml`.
- Change args to accept `Vec<SimpleRoutePlanStep>`.
- Validate each hop label maps.
- Enforce combined percent == 100.
- Maintain deterministic order to preserve predictable encoding.

## 7. Security Considerations
- Never accept arbitrary labels without whitelist mapping.
- Reject empty route plan or zero `in_amount` / `quoted_out_amount`.
- Verify Jupiter program ID matches constant before CPI.

## 8. Observability Checklist
- Log chosen label + percent for each swap.
- Log build tag & IDL hash (add if missing) in a ping or swap preface.
- Off-chain monitor counts of rejected labels.

## 9. Reference Commands
```
# Compute IDL hash
shasum -a 256 target/idl/managed_funds.json | cut -d' ' -f1

# Clean & build
anchor clean && anchor build
```

## 10. Metadata Log Tag Addition (Optional)
Enhance `swap_shared` to emit: `IDL_HASH=<hash>` once per process start (cached static) to make log-based verification easy.

---
Document owner: Engineering
Last updated: (fill on edit)
