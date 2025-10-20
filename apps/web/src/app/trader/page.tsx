'use client';

import { useEffect, useState } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FundPayoutPanel } from '../../components/trader/FundPayoutPanel';
import { FundAccessCodesPanel } from '../../components/trader/FundAccessCodesPanel';
import { RwaAccessCodesPanel } from '../../components/trader/RwaAccessCodesPanel';
import { TOKEN_PROGRAM_ID, createCloseAccountInstruction } from '@solana/spl-token';
import { ParsedAccountData, PublicKey, Transaction } from '@solana/web3.js';
import { toast } from 'sonner';

export default function TraderPage() {
  const wallet = useWallet();
  const { connection } = useConnection();
  const [eligible, setEligible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [funds, setFunds] = useState<Array<Record<string, unknown>>>([]);
  const [rwas, setRwas] = useState<Array<Record<string, unknown>>>([]);
  const [accessView, setAccessView] = useState<'funds' | 'rwa'>('funds');
  const [closingMgr, setClosingMgr] = useState(false);

  useEffect(() => {
    const run = async () => {
      if (!wallet.publicKey) {
        setEligible(false);
        setFunds([]);
        setRwas([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`/api/trader/eligible?wallet=${wallet.publicKey.toString()}`);
        const data = await res.json();
        if (data.success) {
          setEligible(data.data.eligible);
          setFunds(data.data.funds || []);
          setRwas(data.data.rwas || []);
        } else {
          setEligible(false);
        }
      } catch {
        setEligible(false);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [wallet.publicKey]);

  const closeManagerZeroBalances = async () => {
    try {
      if (!wallet.publicKey) {
        toast.error('Connect your wallet first');
        return;
      }
      setClosingMgr(true);
      // Helper: HTTP-based confirmation to avoid WS timeouts
      const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
      const confirmWithHttp = async (
        sig: string,
        timeoutMs = 20000,
        pollIntervalMs = 600
      ): Promise<boolean> => {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
          try {
            const st = await connection.getSignatureStatuses([sig], { searchTransactionHistory: true } as any);
            const s = st?.value?.[0];
            if (s?.confirmationStatus === 'confirmed' || s?.confirmationStatus === 'finalized' || s?.confirmations === 0) {
              return true;
            }
          } catch {
            // ignore and retry
          }
          await sleep(pollIntervalMs);
        }
        return false;
      };
      const before = await connection.getBalance(wallet.publicKey, { commitment: 'confirmed' } as any);
      const resp = await connection.getParsedTokenAccountsByOwner(wallet.publicKey, { programId: TOKEN_PROGRAM_ID });
      const zeroAccounts = resp.value
        .filter((acc): acc is (typeof resp.value[number] & { account: { data: ParsedAccountData } }) => acc.account.data instanceof Object)
        .filter((acc) => {
          const info: any = (acc.account.data as ParsedAccountData).parsed.info;
          const amount = info.tokenAmount?.amount as string | undefined;
          const delegate = info.delegate as string | undefined;
          return amount === '0' && !delegate; // skip delegated/frozen
        })
        .map((acc) => acc.pubkey);

      if (zeroAccounts.length === 0) {
        toast.success('No zero-balance accounts to close');
        setClosingMgr(false);
        return;
      }

      const BATCH_SIZE = 8;
      let closed = 0;
      let lastSig: string | null = null;
      for (let i = 0; i < zeroAccounts.length; i += BATCH_SIZE) {
        const slice = zeroAccounts.slice(i, i + BATCH_SIZE);
        const tx = new Transaction();
        slice.forEach((accPk: PublicKey) => {
          tx.add(createCloseAccountInstruction(accPk, wallet.publicKey!, wallet.publicKey!));
        });
        // Prefer signing locally and sending via RPC proxy to ensure custom RPC usage
        let sig: string;
        if ((wallet as any).signTransaction) {
          tx.feePayer = wallet.publicKey!;
          const { blockhash } = await connection.getLatestBlockhash();
          tx.recentBlockhash = blockhash;
          const signed = await (wallet as any).signTransaction(tx);
          const raw = signed.serialize();
          const txBase64 = Buffer.from(raw).toString('base64');
          const res = await fetch('/api/rpc/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ txBase64, options: { skipPreflight: false, maxRetries: 3 } }),
          });
          const body = await res.json();
          if (!res.ok || body?.error) throw new Error(body?.error?.message || `RPC send failed (${res.status})`);
          sig = body?.signature || body?.result || body?.txid;
          if (!sig) throw new Error('RPC send returned no signature');
          // Confirm via HTTP polling (no WS) with timeout; don't block indefinitely
          await confirmWithHttp(sig, 20000);
        } else {
          // Fallback to adapter’s sendTransaction (uses its configured connection)
          sig = await wallet.sendTransaction(tx, connection);
          await confirmWithHttp(sig, 20000);
        }
        lastSig = sig;
        closed += slice.length;
      }
      // Small delay to let rent refunds reflect
      await sleep(500);
      const after = await connection.getBalance(wallet.publicKey, { commitment: 'processed' } as any);
      const deltaLamports = Math.max(0, after - before);
      const deltaSol = deltaLamports / 1_000_000_000;
      const msg = `Closed ${closed} account(s). ~${deltaSol.toFixed(6)} SOL was sent to your wallet.`;
      if (lastSig) {
        toast.success(`${msg} View: https://solscan.io/tx/${lastSig}`);
      } else {
        toast.success(msg);
      }
    } catch (e: any) {
      console.error('closeManagerZeroBalances error:', e);
      toast.error(e?.message || 'Failed to close zero-balance accounts');
    } finally {
      setClosingMgr(false);
    }
  };


  if (!wallet.connected) {
    return (
      <div className="min-h-screen bg-brand-black text-white">
        <div className="max-w-5xl mx-auto px-4 py-16">
          <div className="rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10">
            <div className="py-12 px-6 flex flex-col items-center gap-4">
              <p className="text-white/70">Connect your wallet to access the Trader Area.</p>
              <WalletMultiButton className="!bg-brand-yellow !text-brand-black !rounded-full !px-6 !py-3 !h-auto !text-sm hover:!brightness-110 !font-semibold" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-black text-white">
        <div className="max-w-5xl mx-auto px-4 py-16">
          <p className="text-white/70">Loading...</p>
        </div>
      </div>
    );
  }

  if (!eligible) {
    return (
      <div className="min-h-screen bg-brand-black text-white">
        <div className="max-w-5xl mx-auto px-4 py-16">
          <div className="rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10">
            <div className="py-10 px-6">
              <p className="text-white/70">Trader area is gated. Create a Fund or an RWA product to access.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-black text-white">
      <div className="max-w-5xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-extrabold mb-6">Trader Area</h1>

        <div className="rounded-2xl bg-brand-surface/70 backdrop-blur-sm border border-white/10 p-4">
          <Tabs defaultValue="funds">
            <TabsList className="bg-black/40 border border-white/10 rounded-xl p-1">
              <TabsTrigger value="funds" className="data-[state=active]:bg-brand-yellow data-[state=active]:text-brand-black rounded-lg px-4 py-2 text-white/70 data-[state=inactive]:hover:bg-white/5 transition">Funds Payout</TabsTrigger>
              <TabsTrigger value="access" className="data-[state=active]:bg-brand-yellow data-[state=active]:text-brand-black rounded-lg px-4 py-2 text-white/70 data-[state=inactive]:hover:bg-white/5 transition">Created Products</TabsTrigger>
            </TabsList>

            <TabsContent value="funds" className="mt-4">
              <div className="rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 p-6">
                <div className="flex items-center justify-between gap-4 mb-4">
                  <h2 className="text-lg font-semibold text-white">Funds Payout</h2>
                  <button
                    type="button"
                    onClick={closeManagerZeroBalances}
                    disabled={closingMgr}
                    className="px-4 py-2 rounded-lg bg-brand-yellow text-brand-black text-sm font-medium hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {closingMgr ? 'Closing…' : 'Close manager zero-balance accounts'}
                  </button>
                </div>
                <FundPayoutPanel funds={funds} managerWallet={wallet.publicKey!.toString()} />
              </div>
            </TabsContent>

              <TabsContent value="access" className="mt-4 space-y-6">
                <div className="flex items-center gap-3">
                  <span className="text-xs uppercase tracking-wide text-white/40">View</span>
                  <div className="inline-flex rounded-full bg-white/5 border border-white/10 p-1">
                    <button
                      type="button"
                      onClick={() => setAccessView('funds')}
                      className={`px-4 py-1.5 text-xs font-medium rounded-full transition ${accessView==='funds' ? 'bg-brand-yellow text-brand-black shadow' : 'text-white/60 hover:text-white'}`}
                    >Funds</button>
                    <button
                      type="button"
                      onClick={() => setAccessView('rwa')}
                      className={`px-4 py-1.5 text-xs font-medium rounded-full transition ${accessView==='rwa' ? 'bg-brand-yellow text-brand-black shadow' : 'text-white/60 hover:text-white'}`}
                    >RWA</button>
                  </div>
                </div>
                {accessView === 'funds' && (
                  <div className="space-y-6">
                    {funds.length === 0 && (
                      <div className="rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 p-6 text-sm text-white/60">No funds yet.</div>
                    )}
                    {funds.map((f: any) => (
                      <div key={f.fundId} className="rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 p-6 space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-base font-semibold text-white">{f.name || f.fundId}</h3>
                          <span className="text-[11px] px-2 py-1 rounded bg-black/30 border border-white/10 text-white/50 font-medium">{(f.access?.type || f.accessMode || 'public').replace('_',' ')}</span>
                        </div>
                        <FundAccessCodesPanel fund={f} />
                      </div>
                    ))}
                  </div>
                )}
                {accessView === 'rwa' && (
                  <div className="space-y-6">
                    {rwas.length === 0 && (
                      <div className="rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 p-6 text-sm text-white/60">No RWA products yet.</div>
                    )}
                    {rwas.map((p: any) => (
                      <div key={p.fundId} className="rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 p-6 space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-base font-semibold text-white">{p.name || p.fundId}</h3>
                          <span className="text-[11px] px-2 py-1 rounded bg-black/30 border border-white/10 text-white/50 font-medium">{(p.access?.type || p.accessMode || 'public').replace('_',' ')}</span>
                        </div>
                        <RwaAccessCodesPanel product={p} />
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
