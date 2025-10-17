"use client";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import "@solana/wallet-adapter-react-ui/styles.css";
import { useEffect } from "react";
import { Toaster } from "sonner";

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
  // On mainnet, default to server-side proxy to avoid exposing RPC keys.
  // Allow explicit NEXT_PUBLIC_SOLANA_RPC_URL override when desired.
  const isBrowser = typeof window !== 'undefined';
  const endpoint = (() => {
    if (process.env.NEXT_PUBLIC_SOLANA_RPC_URL) return process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
    if (isBrowser) {
      // In the browser, ensure absolute URL to satisfy web3.js Connection
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      return cluster === 'mainnet-beta'
        ? `${origin}/api/rpc`
        : 'https://api.devnet.solana.com';
    }
    // Server-side: use absolute URL to avoid Next.js prerender error
    return (
      process.env.SOLANA_RPC_URL ||
      process.env.ANCHOR_PROVIDER_URL ||
      (cluster === 'mainnet-beta' ? 'https://api.mainnet-beta.solana.com' : 'https://api.devnet.solana.com')
    );
  })();
  const wsEndpoint = (() => {
    // Prefer a backend WS proxy so we don't expose provider keys in the browser
    const backend = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (backend) return `${backend.replace(/\/$/, '')}/ws/rpc`;
    // Fallback to explicit public WS only if provided (not recommended on mainnet)
    return process.env.NEXT_PUBLIC_SOLANA_WS_URL || undefined;
  })();
  const wallets = [new PhantomWalletAdapter()];

  return (
  <ConnectionProvider endpoint={endpoint} config={{ commitment: 'confirmed', wsEndpoint }}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          {/* Global toast container */}
          <Toaster richColors position="top-right" closeButton expand={false} />
          <WalletConnectSaver>{children}</WalletConnectSaver>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
