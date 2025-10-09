'use client';

import { useEffect, useMemo, useState } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, LAMPORTS_PER_SOL, Connection } from '@solana/web3.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TokenPicker } from '@/components/TokenPicker';
import { findTokenByMint, fromBaseUnits, toBaseUnits, getCluster } from '@/data/tokenlist';
import { solanaFundServiceModular } from '@/services/solanaFund';

const SOL_MINT = 'So11111111111111111111111111111111111111112';

type FundRow = { fundId: string; name?: string } & Record<string, unknown>;

export default function SwapPage() {
  const wallet = useWallet();
  const [eligible, setEligible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [funds, setFunds] = useState<FundRow[]>([]);

  // Form state (Jupiter-like)
  const [selectedFundId, setSelectedFundId] = useState<string>('');
  const [sellMint, setSellMint] = useState<string>(SOL_MINT);
  const [buyMint, setBuyMint] = useState<string>('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
  const [amountUi, setAmountUi] = useState<string>('0.10');
  const [slippageBps, setSlippageBps] = useState<number>(50);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quoteOut, setQuoteOut] = useState<string | null>(null);
  const [minReceived, setMinReceived] = useState<string | null>(null);
  const cluster = useMemo(() => getCluster(), []);

  useEffect(() => {
    const run = async () => {
      if (!wallet.publicKey) {
        setEligible(false);
        setFunds([]);
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
          if (data.data.funds?.length) setSelectedFundId(data.data.funds[0].fundId);
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

  // Auto-quote preview when inputs change (Jupiter quote is mainnet-only)
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setQuoteOut(null); setMinReceived(null);
      // Jupiter doesn't serve devnet routes; skip preview off-mainnet
      const isMainnet = String(cluster).toLowerCase() === 'mainnet-beta';
      if (!isMainnet) return;
      try {
        const sellDec = findTokenByMint(sellMint)?.decimals ?? 9;
        const parsedUi = parseFloat(amountUi || '0');
        if (!isFinite(parsedUi) || parsedUi <= 0) return;
        const amountBn = toBaseUnits(parsedUi, sellDec);
  // Avoid BigInt literal for older TS targets; compare via string/Number-safe zero check
  if (amountBn === BigInt(0)) return;
        const url = `https://quote-api.jup.ag/v6/quote?inputMint=${sellMint}&outputMint=${buyMint}&amount=${amountBn.toString()}&slippageBps=${slippageBps}`;
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const out = data?.outAmount ? String(data.outAmount) : null;
        setQuoteOut(out);
        if (out) {
          // with bps, min = out * (1 - bps/10000)
          const min = Math.floor(Number(out) * (1 - slippageBps / 10000));
          setMinReceived(String(min));
        }
      } catch { /* ignore preview errors */ }
    };
    run();
    return () => { cancelled = true; };
  }, [sellMint, buyMint, amountUi, slippageBps, cluster]);

  const onSwap = async () => {
    if (!wallet.connected || !wallet.publicKey) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (!selectedFundId) throw new Error('Select a fund');
      // Find the chosen fund name for PDA seeds (fallback to fundId)
      const chosen = funds.find(f => f.fundId === selectedFundId);
      const fundName = String(chosen?.name || selectedFundId);
      const sellDec = findTokenByMint(sellMint)?.decimals ?? 9;
      const parsedUi = parseFloat(amountUi || '0');
      const amountIn = toBaseUnits(isFinite(parsedUi) ? parsedUi : 0, sellDec);
  if (amountIn === BigInt(0)) throw new Error('Amount must be greater than 0');

      const res = await solanaFundServiceModular.defundSwap(wallet, {
        fundName,
        inputMint: sellMint,
        outputMint: buyMint,
        amountIn,
        slippageBps,
      });
      setMessage(`Swap submitted. Signature: ${res.signature}`);
    } catch (e: any) {
      setError(e?.message || 'Swap failed');
    } finally {
      setBusy(false);
    }
  };

  // UI States
  if (!wallet.connected) {
    return (
      <div className="min-h-screen bg-brand-black text-white">
        <div className="max-w-4xl mx-auto px-4 py-16">
          <div className="rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10">
            <div className="py-12 px-6 flex flex-col items-center gap-4">
              <p className="text-white/70">Connect your wallet to access the Swap page.</p>
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
        <div className="max-w-4xl mx-auto px-4 py-16">
          <p className="text-white/70">Loading...</p>
        </div>
      </div>
    );
  }

  if (!eligible) {
    return (
      <div className="min-h-screen bg-brand-black text-white">
        <div className="max-w-4xl mx-auto px-4 py-16">
          <div className="rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10">
            <div className="py-10 px-6">
              <p className="text-white/70">Swap page is manager-gated. Create a Fund to access.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-black text-white">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <h1 className="text-3xl font-extrabold mb-6">Swap</h1>

        {/* Jupiter-like card */}
        <div className="rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 p-6 space-y-5">
          <div>
            <div className="text-xs uppercase text-white/40 mb-2">Fund</div>
            <select className="input w-full appearance-none pr-8" value={selectedFundId} onChange={(e) => setSelectedFundId(e.target.value)}>
              {funds.map((f, idx) => (
                <option key={`${f.fundId}-${idx}`} value={f.fundId}>{String(f.name || f.fundId)}</option>
              ))}
            </select>
          </div>

          <div className="rounded-xl bg-black/30 border border-white/10 p-4 space-y-4">
            <div>
              <div className="text-xs text-white/60 mb-1">Selling</div>
              <div className="grid md:grid-cols-2 gap-3">
                <TokenPicker value={sellMint} onChange={setSellMint} />
                <Input value={amountUi} onChange={(e) => setAmountUi(e.target.value)} className="input w-full text-right" />
              </div>
              <div className="mt-2 grid md:grid-cols-2 gap-3">
                <Input value={sellMint} readOnly className="input w-full text-xs text-white/70" />
                <div className="text-[11px] text-white/40 self-center">Mint address</div>
              </div>
            </div>

            <div>
              <div className="text-xs text-white/60 mb-1">Buying</div>
              <TokenPicker value={buyMint} onChange={setBuyMint} />
              <div className="mt-2 grid md:grid-cols-2 gap-3">
                <Input value={buyMint} readOnly className="input w-full text-xs text-white/70" />
                <div className="text-[11px] text-white/40 self-center">Mint address</div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-xs text-white/60">Slippage</div>
            <div className="flex items-center gap-2">
              <div className="inline-flex bg-white/5 border border-white/10 rounded-full overflow-hidden">
                {[10, 50, 100].map((bps) => (
                  <button key={bps} type="button" onClick={() => setSlippageBps(bps)} className={`px-3 py-1 text-xs ${slippageBps===bps?'bg-brand-yellow text-brand-black':'text-white/70 hover:text-white'}`}>{bps}bps</button>
                ))}
              </div>
              <Input type="number" min={1} max={300} value={slippageBps} onChange={(e) => setSlippageBps(Number(e.target.value || 50))} className="input w-24 text-right" />
              <div className="text-xs text-white/40">bps</div>
            </div>
          </div>

          {/* Quote Preview */}
          {(quoteOut || minReceived || (String(cluster).toLowerCase() !== 'mainnet-beta')) && (
            <div className="rounded-xl bg-black/30 border border-white/10 p-3 text-xs text-white/70">
              {(() => {
                const outDec = findTokenByMint(buyMint)?.decimals ?? 9;
                const outUi = quoteOut ? fromBaseUnits(quoteOut, outDec) : undefined;
                const minUi = minReceived ? fromBaseUnits(minReceived, outDec) : undefined;
                const isMainnet = String(cluster).toLowerCase() === 'mainnet-beta';
                return isMainnet ? (
                  <>
                    {quoteOut && <div>Est. out: <span className="text-white">{outUi?.toFixed(6)}</span></div>}
                    {minReceived && <div>Min received (@{slippageBps}bps): <span className="text-white">{minUi?.toFixed(6)}</span></div>}
                  </>
                ) : (
                  <div className="text-white/60">Quote preview disabled on devnet. Switch to mainnet to see estimated out and minimum received.</div>
                );
              })()}
            </div>
          )}

          <Button onClick={onSwap} disabled={busy} className="w-full rounded-full bg-brand-yellow text-brand-black font-semibold hover:brightness-110 transition">
            {busy ? 'Swapping…' : 'Swap'}
          </Button>

          {message && <div className="text-green-400 text-sm break-all">{message}</div>}
          {error && <div className="text-red-400 text-sm break-all">{error}</div>}
        </div>
      </div>
    </div>
  );
}
