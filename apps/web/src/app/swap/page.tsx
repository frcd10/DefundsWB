"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Connection, VersionedTransaction } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";

// Minimal, single client component (deduplicated) to fix build
type Token = { mint: string; symbol: string; decimals: number };
const TOKENS: Token[] = [
  { mint: "So11111111111111111111111111111111111111112", symbol: "SOL", decimals: 9 },
  { mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", symbol: "USDC", decimals: 6 },
  { mint: "Es9vMFrzaCERmJfrF4H2UVEcN8sELxzAoLTW2Z7KXJ3", symbol: "USDT", decimals: 6 },
];
// Basic picklist options for convenience; fields still show mint addresses
const PICKLIST = TOKENS.filter(t => t.symbol === 'SOL' || t.symbol === 'USDC');

const SLIPPAGE_PRESETS = [1, 5, 10, 50];

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function getBackendCandidates(): string[] {
  const out: string[] = [];
  const env = (process.env.NEXT_PUBLIC_BACKEND_URL || "").trim();
  if (env) out.push(env.replace(/\/$/, ""));
  if (typeof window !== "undefined") {
    const proto = window.location.protocol;
    const host = window.location.hostname;
    const port = (process.env.NEXT_PUBLIC_BACKEND_PORT || "3001").trim();
    out.push(`${proto}//${host}:${port}`);
    if (port !== "10000") out.push(`${proto}//${host}:10000`);
  } else {
    const port = (process.env.NEXT_PUBLIC_BACKEND_PORT || "3001").trim();
    out.push(`http://localhost:${port}`);
    if (port !== "10000") out.push(`http://localhost:10000`);
  }
  return Array.from(new Set(out));
}

function b64ToBytes(b64: string): Uint8Array {
  if (typeof atob === "function") {
    const bin = atob(b64);
    const ui8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) ui8[i] = bin.charCodeAt(i);
    return ui8;
  }
  const buf = Buffer.from(b64, "base64");
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

function bytesToB64(bytes: Uint8Array): string {
  if (typeof btoa !== "function") {
    throw new Error("Base64 encoding not available in this environment");
  }
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export default function SwapPage() {
  const { publicKey, signTransaction } = useWallet();

  // Fund/Vault selection (manager may have more than one)
  const defaultFund = (process.env.NEXT_PUBLIC_FUND_PUBKEY || "").trim();
  const [fundPubkey, setFundPubkey] = useState<string>(defaultFund);
  const [managerFunds, setManagerFunds] = useState<Array<{ fundId: string; name?: string }>>([]);
  useEffect(() => {
    const run = async () => {
      if (!publicKey) { setManagerFunds([]); return; }
      try {
        const res = await fetch(`/api/trader/eligible?wallet=${publicKey.toString()}`);
        const data = await res.json();
        if (data?.success) {
          const fs = (data.data?.funds || []) as Array<any>;
          setManagerFunds(fs.map(f => ({ fundId: f.fundId, name: f.name })));
        } else setManagerFunds([]);
      } catch {
        setManagerFunds([]);
      }
    };
    run();
  }, [publicKey]);

  const [inputMint, setInputMint] = useState<string>(TOKENS[0].mint);
  const [outputMint, setOutputMint] = useState<string>(TOKENS[1].mint);
  const [amount, setAmount] = useState<string>("");
  const [slippage, setSlippage] = useState<number>(1);
  const [quoteOut, setQuoteOut] = useState<number | null>(null);
  const [minOut, setMinOut] = useState<number | null>(null);
  const [quoteLoading, setQuoteLoading] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [lastSig, setLastSig] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState<boolean>(false);
  const lastClickRef = useRef<number>(0);

  const inputToken = useMemo(() => TOKENS.find(t => t.mint === inputMint), [inputMint]);
  // Note: we don't use outputToken object for decimals anymore; we fetch on-chain below
  // Cache for on-chain decimals per mint
  const [mintDecimals, setMintDecimals] = useState<Record<string, number>>({
    [TOKENS[0].mint]: 9, // SOL
    [TOKENS[1].mint]: 6, // USDC
  });

  const getDecimals = useCallback((mint: string): number => {
    if (mintDecimals[mint] != null) return mintDecimals[mint];
    // Fallbacks for known mints; else assume 9 until fetched
    if (mint === TOKENS[0].mint) return 9;
    if (mint === TOKENS[1].mint) return 6;
    return 9;
  }, [mintDecimals]);

  const ensureDecimals = useCallback(async (mint: string) => {
    if (!mint || mintDecimals[mint] != null) return;
    try {
      const res = await fetch(`/api/mint/decimals?mint=${encodeURIComponent(mint)}`, { cache: 'no-store' });
      const data = await res.json();
      if (res.ok && typeof data?.decimals === 'number') {
        setMintDecimals(prev => ({ ...prev, [mint]: data.decimals }));
      }
    } catch {}
  }, [mintDecimals]);

  useEffect(() => { ensureDecimals(inputMint); }, [inputMint, ensureDecimals]);
  useEffect(() => { ensureDecimals(outputMint); }, [outputMint, ensureDecimals]);
  const amountUi = useMemo(() => parseFloat(amount || "0") || 0, [amount]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!amountUi || !inputMint || !outputMint || inputMint === outputMint) {
        setQuoteOut(null); setMinOut(null); return;
      }
      try {
        setQuoteLoading(true);
        await ensureDecimals(inputMint);
        await ensureDecimals(outputMint);
        const inDec = getDecimals(inputMint);
        const base = BigInt(Math.round(amountUi * 10 ** inDec));
        const url = `/api/jupiter/quote?inputMint=${encodeURIComponent(inputMint)}&outputMint=${encodeURIComponent(outputMint)}&amount=${base.toString()}&slippageBps=${Math.round(slippage*100)}&onlyDirectRoutes=false`;
        const res = await fetch(url, { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok || !data || !data.outAmount) {
          if (!cancelled) { setQuoteOut(null); setMinOut(null); }
          return;
        }
        // Convert amounts to UI
        const outDec = getDecimals(outputMint);
        const outUi = Number(data.outAmount) / 10 ** outDec;
        const minUi = outUi * (1 - slippage / 100);
        if (!cancelled) {
          setQuoteOut(outUi);
          setMinOut(minUi);
        }
      } catch {
        if (!cancelled) { setQuoteOut(null); setMinOut(null); }
      } finally {
        if (!cancelled) setQuoteLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [amountUi, inputMint, outputMint, getDecimals, ensureDecimals, slippage]);

  const onSwap = useCallback(async () => {
    if (!publicKey || !signTransaction) return;
    if (busy) return;
    const now = Date.now();
    if (now - lastClickRef.current < 600) return;
    lastClickRef.current = now;

    try {
      setBusy(true);
      const amt = parseFloat(amount || "0");
      if (!amt) throw new Error("Enter amount");
      if (!inputMint || !outputMint || inputMint === outputMint) throw new Error("Select valid mints");
  await ensureDecimals(inputMint);
  const inDec = getDecimals(inputMint);
  const base = BigInt(Math.round(amt * 10 ** inDec));

      const payload = {
        amountLamports: base.toString(),
        payer: publicKey.toBase58(),
        inputMint,
        outputMint,
        slippagePercent: slippage,
        fundPda: fundPubkey || undefined,
      };

      // Use local Next.js proxy to backend to avoid cross-origin/network issues
      const res = await fetch(`/api/swap/vault/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const ct = res.headers.get("content-type") || "";
      const data = ct.includes("application/json") ? await res.json() : await res.text();
      if (!res.ok) {
        let msg = `Prepare failed: HTTP ${res.status}`;
        if (typeof data === 'string') msg += ` - ${data.slice(0, 200)}`;
        else if (data?.error) msg += ` - ${data.error}`;
        if (data?.details) msg += ` | details: ${JSON.stringify(data.details).slice(0, 500)}`;
        throw new Error(msg);
      }

      const bytes = b64ToBytes(data.txBase64);
      const tx = VersionedTransaction.deserialize(bytes);
      const signed = await signTransaction(tx);

      // Send via dedicated server-side endpoint that uses web3.js Connection
      const rawB64 = bytesToB64(signed.serialize());
      const rpcRes = await fetch("/api/rpc/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ txBase64: rawB64, options: { skipPreflight: true, preflightCommitment: "processed" } }),
      });
      const rpcBody = await rpcRes.json().catch(() => ({} as any));
      if (!rpcRes.ok || rpcBody?.error || rpcBody?.ok === false) {
        const msg = rpcBody?.error || `RPC error ${rpcRes.status}`;
        throw new Error(`Proxy RPC error: ${msg}`);
      }
      const sig: string = rpcBody?.signature || rpcBody?.result || rpcBody?.txid;
      if (!sig) throw new Error("Proxy RPC: response missing signature");
      setLastSig(sig);
      setShowConfirm(true);
    } catch (e: any) {
      console.error(e);
      alert(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }, [publicKey, signTransaction, busy, amount, inputMint, outputMint, inputToken, slippage, fundPubkey]);

  const swapEnabled = Boolean(publicKey && amountUi > 0 && inputMint && outputMint && inputMint !== outputMint && fundPubkey);

  return (
    <main className="min-h-screen bg-brand-black text-white">
      <section className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-extrabold mb-6">Vault Swap</h1>
        {/* Fund selector */}
        <div className="mb-4 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 p-4">
          <label className="block text-sm text-white/80 mb-2">Fund (Vault)</label>
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              className="rounded-lg bg-black/40 px-3 py-2 text-sm focus:outline-none border border-white/10 text-white/90"
              value={fundPubkey}
              onChange={(e) => setFundPubkey(e.target.value)}
            >
              <option value="">Select Fund</option>
              {managerFunds.map((f) => (
                <option key={f.fundId} value={f.fundId}>{f.name || f.fundId}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Or paste Fund PDA"
              value={fundPubkey}
              onChange={(e) => setFundPubkey(e.target.value.trim())}
              className="w-full rounded-lg bg-black/40 px-3 py-2 text-sm focus:outline-none border border-white/10 font-mono"
            />
          </div>
          <p className="text-xs text-white/60 mt-2">Manager funds are loaded from the database. Selecting a fund sets its fundId (PDA).</p>
        </div>

        <div className="space-y-4 rounded-2xl bg-brand-surface/70 backdrop-blur-sm border border-white/10 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-white/80 mb-1">From Mint</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inputMint}
                  onChange={(e) => setInputMint(e.target.value.trim())}
                  placeholder="Mint address"
                  className="w-full rounded-lg bg-black/40 px-3 py-2 text-sm focus:outline-none border border-white/10 font-mono"
                />
                <select
                  className="rounded-lg bg-black/40 px-3 py-2 text-sm focus:outline-none border border-white/10"
                  onChange={(e) => setInputMint(e.target.value)}
                  value=""
                >
                  <option value="" disabled>Pick</option>
                  {PICKLIST.map((t) => (
                    <option key={t.mint} value={t.mint}>{t.symbol}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm text-white/80 mb-1">To Mint</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={outputMint}
                  onChange={(e) => setOutputMint(e.target.value.trim())}
                  placeholder="Mint address"
                  className="w-full rounded-lg bg-black/40 px-3 py-2 text-sm focus:outline-none border border-white/10 font-mono"
                />
                <select
                  className="rounded-lg bg-black/40 px-3 py-2 text-sm focus:outline-none border border-white/10"
                  onChange={(e) => setOutputMint(e.target.value)}
                  value=""
                >
                  <option value="" disabled>Pick</option>
                  {PICKLIST.map((t) => (
                    <option key={t.mint} value={t.mint}>{t.symbol}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm text-white/80 mb-1">Amount (From)</label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.0"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              className="w-full rounded-lg bg-black/40 px-3 py-2 text-lg focus:outline-none border border-white/10"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-white/80">Slippage</label>
              <div className="flex items-center gap-2">
                {SLIPPAGE_PRESETS.map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setSlippage(pct)}
                    className={clsx(
                      "rounded-md border px-2 py-1 text-xs",
                      pct === slippage ? "border-brand-yellow/60 bg-brand-yellow/15 text-brand-yellow" : "border-white/10 text-white/80 hover:border-white/20"
                    )}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>
            <div className="relative">
              <input
                type="text"
                inputMode="decimal"
                value={String(slippage)}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9.]/g, "");
                  const n = parseFloat(v);
                  if (!Number.isNaN(n)) setSlippage(n);
                  else if (v === "") setSlippage(0);
                }}
                className="w-full rounded-lg bg-black/40 px-3 py-2 pr-10 focus:outline-none border border-white/10"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-white/60">%</span>
            </div>
          </div>

          <div className="rounded-xl bg-white/5 p-3 text-sm text-white/80 border border-white/10">
            <div className="flex justify-between">
              <span>Estimate {quoteLoading ? "(loading)" : ""}</span>
              <span>{quoteOut != null ? `${quoteOut.toLocaleString(undefined, { maximumFractionDigits: 6 })}` : "-"}</span>
            </div>
            <div className="flex justify-between">
              <span>Min received</span>
              <span>{minOut != null ? `${minOut.toLocaleString(undefined, { maximumFractionDigits: 6 })}` : "-"}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => { if (!swapEnabled) return; onSwap(); }}
            className={clsx(
              "w-full rounded-full bg-brand-yellow py-3 text-center text-base font-semibold text-brand-black",
              "transition-transform duration-100 hover:brightness-110 active:scale-[0.99]",
              (!swapEnabled || busy) && "opacity-70 pointer-events-none"
            )}
          >
            {busy ? "Swapping..." : "Swap"}
          </button>

          <style jsx global>{`
            input[type=number]::-webkit-outer-spin-button,
            input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
            input[type=number] { -moz-appearance: textfield; }
          `}</style>
        </div>
      </section>
      {/* Confirmation Toast/Modal */}
      {showConfirm && lastSig && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowConfirm(false)} />
          <div className="relative w-full sm:max-w-lg rounded-2xl border border-white/10 bg-brand-surface/90 shadow-2xl p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-300">
                ✓
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold">Swap submitted</h3>
                <p className="mt-1 text-sm text-white/70">Your transaction was sent to the network. You can follow it on the explorer.</p>
                <div className="mt-3 rounded-lg bg-black/40 border border-white/10 p-3 font-mono text-xs break-all">
                  {lastSig}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <a
                    className="inline-flex items-center gap-2 rounded-full bg-brand-yellow text-brand-black px-4 py-2 text-sm font-semibold hover:brightness-110"
                    href={`https://solscan.io/tx/${lastSig}`}
                    target="_blank" rel="noreferrer"
                  >
                    View on Solscan
                  </a>
                  <a
                    className="inline-flex items-center gap-2 rounded-full bg-brand-yellow/90 text-brand-black px-4 py-2 text-sm font-semibold hover:brightness-110"
                    href={`https://explorer.solana.com/tx/${lastSig}`}
                    target="_blank" rel="noreferrer"
                  >
                    View on Explorer
                  </a>
                  <button
                    className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm hover:bg-white/10"
                    onClick={async () => {
                      try { await navigator.clipboard.writeText(lastSig); } catch {}
                    }}
                  >
                    Copy hash
                  </button>
                  <button
                    className="ml-auto inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm hover:bg-white/10"
                    onClick={() => setShowConfirm(false)}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}