"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Connection, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { TOKEN_PROGRAM_ID, NATIVE_MINT, getAssociatedTokenAddress } from '@solana/spl-token';
import { toast } from 'sonner';
import { getProgram } from '@/services/solanaFund/core/program';
import { findTokenByMint } from '@/data/tokenlist';

// Minimal, single client component (deduplicated) to fix build
type Token = { mint: string; symbol: string; decimals: number };
const TOKENS: Token[] = [
  { mint: "So11111111111111111111111111111111111111112", symbol: "SOL", decimals: 9 },
  { mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", symbol: "USDC", decimals: 6 },
  { mint: "Es9vMFrzaCERmJfrF4H2UVEcN8sELxzAoLTW2Z7KXJ3", symbol: "USDT", decimals: 6 },
];
// Basic picklist options for convenience; fields still show mint addresses
const PICKLIST = TOKENS.filter(t => t.symbol === 'SOL' || t.symbol === 'USDC');

const SLIPPAGE_PRESETS = [2.5, 5, 20, 75];

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
  const { connection } = useConnection();

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
          const mapped = fs.map(f => ({ fundId: String(f.fundId || '').trim(), name: f.name }));
          setManagerFunds(mapped);
          // Auto-select if 
          if (!fundPubkey && mapped.length === 1 && mapped[0].fundId) {
            setFundPubkey(mapped[0].fundId);
          }
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
  const [slippage, setSlippage] = useState<number>(5);
  const [quoteOut, setQuoteOut] = useState<number | null>(null);
  const [minOut, setMinOut] = useState<number | null>(null);
  const [quoteLoading, setQuoteLoading] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [lastSig, setLastSig] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState<boolean>(false);
  const lastClickRef = useRef<number>(0);

  // Vault balances & tokens view
  const [fundSolLamports, setFundSolLamports] = useState<number | null>(null);
  const [wsolUi, setWsolUi] = useState<number>(0);
  const [vaultTokens, setVaultTokens] = useState<Array<{ ata: string; mint: string; uiAmount: number; raw: string; decimals: number; hasDelegate: boolean }>>([]);
  const [zeroCount, setZeroCount] = useState<number>(0);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const [prices, setPrices] = useState<Record<string, { priceBaseUnits: string; updatedAt: number; name?: string }>>({});
  const [refreshTimes, setRefreshTimes] = useState<number[]>([]);

  // Fetch vault positions when a fund is selected
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setFundSolLamports(null);
        setWsolUi(0);
        setVaultTokens([]);
        setZeroCount(0);
        if (!fundPubkey || !fundPubkey.trim()) return;
        let fundPk: PublicKey;
        try {
          fundPk = new PublicKey(fundPubkey.trim());
        } catch {
          console.warn('[vault] Invalid fund pubkey:', fundPubkey);
          return;
        }
        // Log for debugging if needed
        // eslint-disable-next-line no-console
        console.log('[vault] fetching positions for', fundPk.toBase58());
        const [lamports, parsed] = await Promise.all([
          connection.getBalance(fundPk, { commitment: 'processed' } as any).catch(() => 0),
          connection.getParsedTokenAccountsByOwner(fundPk, { programId: TOKEN_PROGRAM_ID })
        ]);
        if (cancelled) return;
        setFundSolLamports(lamports);
        const rows: Array<{ ata: string; mint: string; uiAmount: number; raw: string; decimals: number; hasDelegate: boolean }> = [];
        let wsolBalance = 0;
        let zeros = 0;
        for (const { pubkey, account } of parsed.value) {
          const anyData: any = account.data;
          if (!anyData || anyData.program !== 'spl-token') continue;
          const info = (anyData.parsed?.info || {}) as any;
          const mint: string = info.mint;
          const amountRaw: string = info.tokenAmount?.amount ?? '0';
          const decimals: number = Number(info.tokenAmount?.decimals ?? 0);
          const uiAmount: number = Number(info.tokenAmount?.uiAmount ?? 0);
          const delegate = info.delegate as string | undefined;
          if (mint === NATIVE_MINT.toBase58()) {
            wsolBalance = uiAmount;
          }
          if (amountRaw === '0' && !delegate) zeros++;
          rows.push({ ata: pubkey.toBase58(), mint, uiAmount, raw: amountRaw, decimals, hasDelegate: Boolean(delegate) });
        }
        if (!cancelled) {
          setWsolUi(wsolBalance);
          // Sort by balance desc, then mint
          rows.sort((a, b) => b.uiAmount - a.uiAmount || a.mint.localeCompare(b.mint));
          setVaultTokens(rows);
          setZeroCount(zeros);
          setPage(1);
          // Fetch token prices and names from backend cache (will upsert via Helius)
          try {
            const uniqueMints = Array.from(new Set(rows.map(r => r.mint)));
            if (uniqueMints.length) {
              const url = '/api/prices?' + uniqueMints.map(m => `mints=${encodeURIComponent(m)}`).join('&');
              const resp = await fetch(url, { cache: 'no-store' });
              const data = await resp.json();
              if (resp.ok && Array.isArray(data?.items)) {
                setPrices((prev) => {
                  const next = { ...prev } as any;
                  for (const it of data.items) next[it.mint] = { priceBaseUnits: String(it.priceBaseUnits || '0'), updatedAt: Number(it.updatedAt || 0), name: it.name };
                  return next;
                });
              }
            }
          } catch {}
        }
      } catch (e) {
        if (!cancelled) {
          setFundSolLamports(0);
          setWsolUi(0);
          setVaultTokens([]);
          setZeroCount(0);
        }
      }
    };
    if (fundPubkey && fundPubkey.length > 0) run();
    return () => { cancelled = true; };
  }, [fundPubkey, connection]);

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
        <h1 className="text-3xl font-extrabold mb-6">Vault Swap - V1</h1>
        {/* Fund selector */}
        <div className="mb-4 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 p-4">
          <label className="block text-sm text-white/80 mb-2">Fund (Vault)</label>
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              className="rounded-lg bg-black/40 px-3 py-2 text-sm focus:outline-none border border-white/10 text-white/90"
              value={fundPubkey}
              onChange={(e) => setFundPubkey(e.target.value.trim())}
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
          {fundPubkey?.trim() && (
            <div className="mt-2 text-[11px] text-white/50 font-mono break-all">Selected fund: {fundPubkey.trim()}</div>
          )}
        </div>

        {/* Vault balances overview */}
        {Boolean(fundPubkey?.trim()) && (
          <div className="mb-4 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 p-4 space-y-3">
            <h2 className="text-base font-semibold text-white">Vault Balances</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-lg bg-black/30 border border-white/10 p-3">
                <div className="text-xs text-white/60">SOL balance</div>
                <div className="text-lg font-semibold">{fundSolLamports == null ? '—' : (fundSolLamports/1_000_000_000).toFixed(6)} SOL</div>
              </div>
              <div className="rounded-lg bg-black/30 border border-white/10 p-3">
                <div className="text-xs text-white/60">WSOL balance</div>
                <div className="text-lg font-semibold">{wsolUi.toFixed(6)} WSOL</div>
              </div>
              <div className="rounded-lg bg-black/30 border border-white/10 p-3">
                <div className="text-xs text-white/60">0-balance token accounts</div>
                <div className="text-lg font-semibold">{zeroCount}</div>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-white/60">Tokens held by the vault (page {page})</div>
              <div className="flex gap-2 items-center">
                <button
                  type="button"
                  className="text-xs rounded-md px-3 py-1 bg-white/10 border border-white/15 hover:bg-white/15"
                  onClick={() => {
                    const now = Date.now();
                    setRefreshTimes((prev) => {
                      const filtered = prev.filter(t => now - t <= 3600_000);
                      const perSec = filtered.filter(t => now - t <= 1000).length;
                      const perMin = filtered.filter(t => now - t <= 60_000).length;
                      if (perSec >= 1) { toast.info('Please wait a second before refreshing again'); return filtered; }
                      if (perMin >= 10) { toast.info('Refresh limit: 10 times per minute'); return filtered; }
                      if (filtered.length >= 120) { toast.info('Refresh limit: 120 times per hour'); return filtered; }
                      // re-run fetch by calling effect body inline
                      (async () => {
                        try {
                          if (!fundPubkey?.trim()) return;
                          const pk = new PublicKey(fundPubkey.trim());
                          const [lam2, parsed2] = await Promise.all([
                            connection.getBalance(pk, { commitment: 'processed' } as any).catch(() => 0),
                            connection.getParsedTokenAccountsByOwner(pk, { programId: TOKEN_PROGRAM_ID })
                          ]);
                          setFundSolLamports(lam2);
                          const rows2: any[] = [];
                          let w2 = 0; let z2 = 0;
                          for (const { pubkey, account } of parsed2.value) {
                            const anyData: any = account.data;
                            if (!anyData || anyData.program !== 'spl-token') continue;
                            const info = (anyData.parsed?.info || {}) as any;
                            const mint: string = info.mint;
                            const amountRaw: string = info.tokenAmount?.amount ?? '0';
                            const uiAmount: number = Number(info.tokenAmount?.uiAmount ?? 0);
                            const decimals: number = Number(info.tokenAmount?.decimals ?? 0);
                            const delegate = info.delegate as string | undefined;
                            if (mint === NATIVE_MINT.toBase58()) w2 = uiAmount;
                            if (amountRaw === '0' && !delegate) z2++;
                            rows2.push({ ata: pubkey.toBase58(), mint, uiAmount, raw: amountRaw, decimals, hasDelegate: Boolean(delegate) });
                          }
                          rows2.sort((a: any, b: any) => b.uiAmount - a.uiAmount || a.mint.localeCompare(b.mint));
                          setVaultTokens(rows2);
                          setWsolUi(w2);
                          setZeroCount(z2);
                          try {
                            const uniqueMints = Array.from(new Set(rows2.map((r: any) => r.mint)));
                            if (uniqueMints.length) {
                              const url = '/api/prices?' + uniqueMints.map((m: string) => `mints=${encodeURIComponent(m)}`).join('&');
                              const resp = await fetch(url, { cache: 'no-store' });
                              const data = await resp.json();
                              if (resp.ok && Array.isArray(data?.items)) {
                                setPrices((prev) => {
                                  const next = { ...prev } as any;
                                  for (const it of data.items) next[it.mint] = { priceBaseUnits: String(it.priceBaseUnits || '0'), updatedAt: Number(it.updatedAt || 0), name: it.name };
                                  return next;
                                });
                              }
                            }
                          } catch {}
                        } catch (e) { console.warn('refresh failed', e); }
                      })();
                      return [...filtered, now];
                    });
                  }}
                >Refresh</button>
                <button
                  type="button"
                  className="text-xs rounded-md px-3 py-1 bg-white/10 border border-white/15 hover:bg-white/15 disabled:opacity-50"
                  onClick={() => setPage(p => Math.max(1, p-1))}
                  disabled={page <= 1}
                >Prev</button>
                <button
                  type="button"
                  className="text-xs rounded-md px-3 py-1 bg-white/10 border border-white/15 hover:bg-white/15 disabled:opacity-50"
                  onClick={() => setPage(p => (p*PAGE_SIZE >= vaultTokens.length ? p : p+1))}
                  disabled={page*PAGE_SIZE >= vaultTokens.length}
                >Next</button>
              </div>
            </div>
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full text-sm">
                <thead className="bg-brand-surface">
                  <tr>
                    <th className="px-4 py-2 text-left text-white/60 font-semibold">Name</th>
                    <th className="px-4 py-2 text-left text-white/60 font-semibold w-[180px]">Mint</th>
                    <th className="px-4 py-2 text-left text-white/60 font-semibold">Balance</th>
                    <th className="px-4 py-2 text-left text-white/60 font-semibold">USD value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {vaultTokens
                    .filter(row => row.mint !== NATIVE_MINT.toBase58())
                    .slice((page-1)*PAGE_SIZE, page*PAGE_SIZE)
                    .map((row, idx) => {
                    const info = findTokenByMint(row.mint);
                    const p = prices[row.mint];
                    const usd = p ? (row.uiAmount * (Number(p.priceBaseUnits || '0') / 1_000_000)) : 0;
                    return (
                      <tr key={`${row.mint}-${idx}`} className="hover:bg-white/5">
                        <td className="px-4 py-2 text-white">{p?.name || info?.name || info?.symbol || 'Token'}</td>
                        <td className="px-4 py-2 text-white/80 font-mono">
                          <div className="flex items-center gap-2">
                            <span className="font-mono" title={row.mint}>{row.mint.slice(0,5)}…</span>
                            <button
                              type="button"
                              className="text-[11px] rounded-md px-2 py-1 bg-white/10 border border-white/15 hover:bg-white/15"
                              onClick={async () => { try { await navigator.clipboard.writeText(row.mint); toast.success('Mint copied'); } catch {} }}
                            >Copy</button>
                            <div className="ml-2 hidden sm:flex items-center gap-1">
                              {[1, 0.5, 0.25, 0.1].map((pct) => (
                                <button
                                  key={pct}
                                  type="button"
                                  className="text-[11px] rounded-md px-2 py-1 bg-brand-yellow/20 border border-brand-yellow/40 text-brand-yellow hover:bg-brand-yellow/30"
                                  onClick={async () => {
                                    if (!fundPubkey) { toast.error('Select a fund'); return; }
                                    const qty = row.uiAmount * pct;
                                    if (!qty) { toast.info('Nothing to sell'); return; }
                                    // Quick-sell to SOL
                                    try {
                                      const amt = Number(qty.toFixed(9));
                                      const payload = { amountLamports: '', payer: publicKey?.toBase58(), inputMint: row.mint, outputMint: TOKENS[0].mint, slippagePercent: slippage, fundPda: fundPubkey };
                                      // Use existing doSwap path via form state is complex; reuse current swap flow inline
                                      // Ensure decimals to compute lamports
                                      await ensureDecimals(row.mint);
                                      const inDec = getDecimals(row.mint);
                                      const base = BigInt(Math.round(amt * 10 ** inDec));
                                      payload.amountLamports = base.toString();
                                      const res = await fetch(`/api/swap/vault/prepare`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                                      const ct = res.headers.get('content-type') || '';
                                      const data = ct.includes('application/json') ? await res.json() : await res.text();
                                      if (!res.ok) throw new Error(typeof data === 'string' ? data : data?.error || 'Prepare failed');
                                      const bytes = b64ToBytes((data as any).txBase64);
                                      const tx = VersionedTransaction.deserialize(bytes);
                                      const signed = await (signTransaction as any)(tx);
                                      const rawB64 = bytesToB64(signed.serialize());
                                      const rpcRes = await fetch('/api/rpc/send', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ txBase64: rawB64, options: { skipPreflight: true, preflightCommitment: 'processed' } }) });
                                      const rpcBody = await rpcRes.json().catch(() => ({} as any));
                                      if (!rpcRes.ok || rpcBody?.error || rpcBody?.ok === false) throw new Error(rpcBody?.error || `RPC ${rpcRes.status}`);
                                      const sig: string = rpcBody?.signature || rpcBody?.result || rpcBody?.txid;
                                      if (sig) { setLastSig(sig); setShowConfirm(true); }
                                    } catch (e: any) {
                                      console.error('quick sell error', e);
                                      toast.error(e?.message || 'Sell failed');
                                    }
                                  }}
                                  disabled={busy}
                                  title={`Swap ${pct*100}% to SOL`}
                                >{pct*100}%</button>
                              ))}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-white">{row.uiAmount.toLocaleString(undefined, { maximumFractionDigits: 6 })}</td>
                        <td className="px-4 py-2 text-emerald-400">{usd ? `$${usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              {/* Slippage presets moved here and shared across buy/sell */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/70">Slippage:</span>
                {SLIPPAGE_PRESETS.map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setSlippage(pct)}
                    className={clsx(
                      "text-xs rounded-md px-2 py-1 border",
                      pct === slippage ? "border-brand-yellow/60 bg-brand-yellow/15 text-brand-yellow" : "border-white/10 text-white/80 hover:border-white/20"
                    )}
                  >{pct}%</button>
                ))}
                <div className="flex items-center gap-1 ml-2">
                  <input
                    type="number"
                    step="0.1"
                    min={0}
                    max={100}
                    value={Number.isFinite(slippage) ? slippage : 0}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (Number.isFinite(v)) setSlippage(Math.max(0, Math.min(100, v)));
                    }}
                    className="w-20 rounded-md bg-black/40 px-2 py-1 text-xs border border-white/10 text-white"
                    placeholder="Custom %"
                  />
                  <span className="text-xs text-white/60">%</span>
                </div>
              </div>
              <button
                type="button"
                className="mt-1 sm:mt-0 inline-flex items-center gap-2 rounded-lg bg-brand-yellow text-brand-black font-semibold px-4 py-2 hover:brightness-110"
                onClick={async () => {
                  try {
                    if (!publicKey || !signTransaction) { toast.error('Connect wallet'); return; }
                    if (!fundPubkey) { toast.error('Select a fund'); return; }
                    const fundPk = new PublicKey(fundPubkey);
                    const zeroAtas = vaultTokens.filter(r => r.raw === '0' && !r.hasDelegate).map(r => new PublicKey(r.ata));
                    if (zeroAtas.length === 0) { toast.info('No zero-balance token accounts to close'); return; }
                    // Compute fund WSOL ATA (destination of lamports)
                    const wsolAta = await getAssociatedTokenAddress(NATIVE_MINT, fundPk, true);
                    const program = await getProgram(connection as unknown as Connection, { publicKey, signTransaction } as any);
                    const ix = await (program as any).methods
                      .closeZeroTokenAccounts()
                      .accounts({ fund: fundPk, fundWsolAta: wsolAta, tokenProgram: TOKEN_PROGRAM_ID })
                      .remainingAccounts(zeroAtas.map((pk: PublicKey) => ({ pubkey: pk, isWritable: true, isSigner: false })))
                      .instruction();
                    const tx = new Transaction().add(ix);
                    const { blockhash } = await connection.getLatestBlockhash('finalized');
                    tx.recentBlockhash = blockhash;
                    tx.feePayer = publicKey;
                    const signed = await signTransaction(tx);
                    const raw = signed.serialize();
                    const txBase64 = (typeof Buffer !== 'undefined' ? Buffer.from(raw).toString('base64') : btoa(String.fromCharCode(...raw)));
                    const res = await fetch('/api/rpc/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ txBase64, options: { skipPreflight: false, maxRetries: 3 } }) });
                    const body = await res.json();
                    if (!res.ok || body?.error) throw new Error(body?.error?.message || `RPC send failed (${res.status})`);
                    const sig: string = body?.signature || body?.result || body?.txid;
                    toast.success(`Close-zero submitted. View: https://solscan.io/tx/${sig}`);
                    // Refresh balances shortly after
                    setTimeout(() => {
                      // trigger effect by setting page (no-op) and resetting fundPubkey to itself
                      setPage(p => p);
                      // Re-run fetch
                      (async () => {
                        try {
                          const fundPk2 = new PublicKey(fundPubkey);
                          const [lam2, parsed2] = await Promise.all([
                            connection.getBalance(fundPk2, { commitment: 'processed' } as any).catch(() => 0),
                            connection.getParsedTokenAccountsByOwner(fundPk2, { programId: TOKEN_PROGRAM_ID })
                          ]);
                          setFundSolLamports(lam2);
                          const rows2: any[] = [];
                          let w2 = 0; let z2 = 0;
                          for (const { pubkey, account } of parsed2.value) {
                            const anyData: any = account.data;
                            if (!anyData || anyData.program !== 'spl-token') continue;
                            const info = (anyData.parsed?.info || {}) as any;
                            const mint: string = info.mint;
                            const amountRaw: string = info.tokenAmount?.amount ?? '0';
                            const decimals: number = Number(info.tokenAmount?.decimals ?? 0);
                            const uiAmount: number = Number(info.tokenAmount?.uiAmount ?? 0);
                            const delegate = info.delegate as string | undefined;
                            if (mint === NATIVE_MINT.toBase58()) w2 = uiAmount;
                            if (amountRaw === '0' && !delegate) z2++;
                            rows2.push({ ata: pubkey.toBase58(), mint, uiAmount, raw: amountRaw, decimals, hasDelegate: Boolean(delegate) });
                          }
                          rows2.sort((a: any, b: any) => b.uiAmount - a.uiAmount || a.mint.localeCompare(b.mint));
                          setVaultTokens(rows2);
                          setWsolUi(w2);
                          setZeroCount(z2);
                        } catch {}
                      })();
                    }, 800);
                  } catch (e: any) {
                    console.error('close vault zero balances error:', e);
                    toast.error(e?.message || 'Failed to close zero-balance token accounts');
                  }
                }}
              >Close vault zero-balance ATAs</button>
            </div>
          </div>
        )}

        {/* Manual sell (between balances and buy) */}
        {Boolean(fundPubkey?.trim()) && (
          <ManualSell
            slippage={slippage}
            fundPubkey={fundPubkey}
            vaultTokens={vaultTokens}
            connection={connection}
            publicKey={publicKey}
            signTransaction={signTransaction}
            ensureDecimals={ensureDecimals}
            getDecimals={getDecimals}
            onConfirm={(sig) => { setLastSig(sig); setShowConfirm(true); }}
          />
        )}

        <div className="space-y-4 rounded-2xl bg-brand-surface/70 backdrop-blur-sm border border-white/10 p-4">
          {/* Buy form: From is always SOL; To is paste mint */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-white/80 mb-1">From</label>
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-black/40 px-3 py-2 text-sm border border-white/10">SOL</div>
              </div>
            </div>
            <div>
              <label className="block text-sm text-white/80 mb-1">To Mint</label>
              <input
                type="text"
                value={outputMint}
                onChange={(e) => setOutputMint(e.target.value.trim())}
                placeholder="Paste token mint address"
                className="w-full rounded-lg bg-black/40 px-3 py-2 text-sm focus:outline-none border border-white/10 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-white/80 mb-1">Amount (SOL)</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="decimal"
                placeholder="0.0"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                className="w-40 rounded-lg bg-black/40 px-3 py-2 text-lg focus:outline-none border border-white/10"
              />
              <div className="flex flex-wrap gap-2">
                {[0.10, 0.25, 1, 2, 5, 10].map(v => (
                  <button
                    key={v}
                    type="button"
                    className="text-xs rounded-md px-2 py-1 bg-white/10 border border-white/15 hover:bg-white/15"
                    onClick={() => setAmount(String(v))}
                  >{v}</button>
                ))}
              </div>
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

type ManualSellProps = {
  slippage: number;
  fundPubkey: string;
  vaultTokens: Array<{ ata: string; mint: string; uiAmount: number; raw: string; decimals: number; hasDelegate: boolean }>;
  connection: Connection;
  publicKey: PublicKey | null;
  signTransaction: ((tx: VersionedTransaction | Transaction) => Promise<VersionedTransaction | Transaction>) | undefined;
  ensureDecimals: (mint: string) => Promise<void>;
  getDecimals: (mint: string) => number;
  onConfirm?: (sig: string) => void;
}

function ManualSell(props: ManualSellProps) {
  const { slippage, fundPubkey, vaultTokens, publicKey, signTransaction, ensureDecimals, getDecimals, onConfirm } = props;
  const [mint, setMint] = useState<string>("");
  const [percent, setPercent] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const sell = useCallback(async () => {
    try {
      if (!publicKey || !signTransaction) { toast.error('Connect wallet'); return; }
      const m = mint.trim();
      if (!m) { toast.error('Paste token mint'); return; }
      const pct = parseFloat(percent || '0');
      if (!pct || pct <= 0 || pct > 100) { toast.error('Enter % between 0 and 100'); return; }
      const row = vaultTokens.find(r => r.mint === m);
      if (!row || row.uiAmount <= 0) { toast.error('Vault has no balance for this mint'); return; }
      setBusy(true);
      await ensureDecimals(m);
      const inDec = getDecimals(m);
      const qty = row.uiAmount * (pct / 100);
      const base = BigInt(Math.round(qty * 10 ** inDec));
      const payload = { amountLamports: base.toString(), payer: publicKey.toBase58(), inputMint: m, outputMint: NATIVE_MINT.toBase58(), slippagePercent: slippage, fundPda: fundPubkey };
      const res = await fetch(`/api/swap/vault/prepare`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const ct = res.headers.get('content-type') || '';
      const data = ct.includes('application/json') ? await res.json() : await res.text();
      if (!res.ok) throw new Error(typeof data === 'string' ? data : data?.error || 'Prepare failed');
      const bytes = b64ToBytes((data as any).txBase64);
      const tx = VersionedTransaction.deserialize(bytes);
      const signed = await (signTransaction as any)(tx);
      const rawB64 = bytesToB64(signed.serialize());
      const rpcRes = await fetch('/api/rpc/send', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ txBase64: rawB64, options: { skipPreflight: true, preflightCommitment: 'processed' } }) });
      const rpcBody = await rpcRes.json().catch(() => ({} as any));
      if (!rpcRes.ok || rpcBody?.error || rpcBody?.ok === false) throw new Error(rpcBody?.error || `RPC ${rpcRes.status}`);
      const sig: string = rpcBody?.signature || rpcBody?.result || rpcBody?.txid;
      if (sig) {
        if (onConfirm) onConfirm(sig);
        else toast.success(`Manual sell submitted. View: https://solscan.io/tx/${sig}`);
      }
    } catch (e: any) {
      console.error('manual sell error', e);
      toast.error(e?.message || 'Sell failed');
    } finally {
      setBusy(false);
    }
  }, [mint, percent, slippage, fundPubkey, vaultTokens, publicKey, signTransaction, ensureDecimals, getDecimals]);

  return (
    <section className="max-w-3xl mx-auto px-4 mb-4">
      <div className="rounded-2xl bg-brand-surface/70 backdrop-blur-sm border border-white/10 p-4">
        <h2 className="text-base font-semibold text-white mb-2">Manual sell</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div>
            <label className="block text-xs text-white/70 mb-1">Token mint</label>
            <input
              type="text"
              value={mint}
              onChange={(e) => setMint(e.target.value.trim())}
              placeholder="Paste mint to sell"
              className="w-full rounded-lg bg-black/40 px-3 py-2 text-sm focus:outline-none border border-white/10 font-mono"
            />
          </div>
          <div>
            <label className="block text-xs text-white/70 mb-1">Amount (%)</label>
            <input
              type="number"
              inputMode="decimal"
              placeholder="e.g. 50"
              value={percent}
              onChange={(e) => setPercent(e.target.value.replace(/[^0-9.]/g, ''))}
              className="w-full rounded-lg bg-black/40 px-3 py-2 text-sm focus:outline-none border border-white/10"
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => { if (!busy) sell(); }}
              className={clsx("w-full rounded-lg bg-brand-yellow text-brand-black font-semibold px-4 py-2 hover:brightness-110", busy && "opacity-60 pointer-events-none")}
            >
              {busy ? 'Swapping…' : 'Swap'}
            </button>
          </div>
        </div>
        <p className="text-[11px] text-white/60 mt-2">Uses the selected slippage ({slippage}%) and sends proceeds to the vault.</p>
      </div>
    </section>
  );
}