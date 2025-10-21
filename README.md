1 - Clone Repo
2 - Add .env file to root and web
3 - add managed_funds-keypair.json to deploy folder inside target to use/upgrade deployed program (target should be in root folder.)
4 - To upgrade deployed program also you need the correct wallet auth keypair inside "~/.config/solana/id.json"
*If no program is set on number 3 = New program will be created
*To use first time, ignore step 3 and 4 - Make sure wallet in "~/.config/solana/id.json" has ~4 Sol to deploy program 1st time.

________
Inside root 
1 - npm install
2 - npm run build
3 - anchor build
4 - anchor deploy
on step 4 use anchor deploy --provider.cluster https://devnet.helius-rpc.com/?api-key=

npm -w apps/web install
npm -w apps/web run build

Go to solscan to your program deploy
Run npm run dev to use website locally.


__________________TO change run Devnet vs Mainnet.
1 - Anchor.toml
2 - lib.rs
.env in web,root and backend


______Retrieve back SOL after launch
Check you control it (Recipient will receive the funds - good to be same as auth)
solana program show DEFuNDoMVQ8TnYjDM95bJK55Myr5dmwor43xboG2XQYd \
  --url "https://devnet.helius-rpc.com/?api-key=APIKEY"

solana program close DEFuNDoMVQ8TnYjDM95bJK55Myr5dmwor43xboG2XQYd \
  --bypass-warning \
  --recipient DefUNDgVXcK1P6QA3mgWCXpRxaXo1v3BrBb9UF3tK7HW \
  --url "https://devnet.helius-rpc.com/?api-key={APIKEY}"


  _______If error on upgrade.
  solana program show --buffers

solana -u mainnet-beta -k /home/felip/.config/solana/id_mainnet.json \
  program close --buffers \
  --recipient DefUNDgVXcK1P6QA3mgWCXpRxaXo1v3BrBb9UF3tK7HW

# After PRs.
git checkout main
git pull origin main
git checkout mainnet
git merge main
git push origin mainnet

## Daily P&L updater

- A daily cron is defined in `render.yaml` and `render.backend.yaml` as `defunds-pnl-daily-cron`.
- It runs `node apps/backend/dist/scripts/runDailyPnl.js` once per day at 01:00 UTC.
- Required env: `MONGODB_URI`. Optional: `SOLANA_RPC_URL`, `MANAGED_FUNDS_PROGRAM_ID`, and either `PRICES_BASE_URL` or `WEB_BASE_URL` for price lookups.

One-time seeding for a fund (baseline yesterday=1.0 and today=cumulative):
- Temporarily set `SEED_FUND_ID=3fjnB17kMDwfWBbswPAKpQ4Frk7Uyg8i6NrHMHR2zxz3` on the cron (or run the script locally with that env).
- Let it run once, then remove the env to avoid re-seeding.

Local run (optional):
- From repo root: `npm -w apps/backend run build` then `SEED_FUND_ID=<FUND_ID> node apps/backend/dist/scripts/runDailyPnl.js`
