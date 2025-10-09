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
on step 4 use anchor deploy --provider.cluster https://devnet.helius-rpc.com/?api-key=19e2e36f-3222-481a-af0d-4271e77bb9b2

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