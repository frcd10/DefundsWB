1 - Clone Repo
2 - Add .env file to root and web
3 - add managed_funds-keypair.json to deploy folder inside target to use/upgrade deployed program
4 - To upgrade deployed program also you need the correct wallet auth keypair inside "~/.config/solana/id.json"
*If no program is set on number 3 = New program will be created
*To use first time, ignore step 3 and 4 - Make sure wallet in "~/.config/solana/id.json" has ~4 Sol to deploy program 1st time.

________
Inside root 
1 - npm install
2 - npm run build
3 - anchor build
4 - anchor deploy

Go to solscan to your program deploy
Run npm run dev to use website locally.


