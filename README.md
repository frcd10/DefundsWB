DeFunds Finance is a DeFi platform that provides the best tools for influencers and KOLs to interact with their audience. We’re redefining copy trading by introducing Vaults that act as single on-chain investors, where managers execute swaps, and all participants within a vault are included in one unified order. We’re bringing to Solana what traditional finance has had for decades. Our goal is to become the standard infrastructure for decentralized asset management on-chain.

Defunds’ edge starts with being permissionless, allowing anyone to act as a manager and receive a performance fee.
We discovered a blue ocean: managers can trade any asset on Solana, including Pump Fun and Meteora DBC tokens — every competitor ignored them. 



________
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

