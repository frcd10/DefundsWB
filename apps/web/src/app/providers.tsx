"use client";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import "@solana/wallet-adapter-react-ui/styles.css";
import { useEffect } from "react";

function WalletConnectSaver({ children }: { children: React.ReactNode }) {
  const wallet = useWallet();

  useEffect(() => {
    if (wallet.connected && wallet.publicKey) {
      const addr = wallet.publicKey.toString();
      // fire-and-forget save of the wallet to Users collection
      fetch('/api/users/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: addr }),
      }).catch(() => {});
    }
  }, [wallet.connected, wallet.publicKey]);

  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER || "mainnet-beta";
  const endpoint =
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
    (cluster === 'mainnet-beta'
      ? 'https://api.mainnet-beta.solana.com'
      : 'https://api.devnet.solana.com');
  const wallets = [new PhantomWalletAdapter()];

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <WalletConnectSaver>{children}</WalletConnectSaver>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
