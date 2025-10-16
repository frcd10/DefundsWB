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

export default function SwapPage() {
  const { publicKey, signTransaction } = useWallet();

  const [inputMint, setInputMint] = useState<string>(TOKENS[0].mint);
  const [outputMint, setOutputMint] = useState<string>(TOKENS[1].mint);
  const [amount, setAmount] = useState<string>("");
  const [slippage, setSlippage] = useState<number>(1);
  const [quoteOut, setQuoteOut] = useState<number | null>(null);
  const [minOut, setMinOut] = useState<number | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const lastClickRef = useRef<number>(0);

  const inputToken = useMemo(() => TOKENS.find(t => t.mint === inputMint), [inputMint]);
  const outputToken = useMemo(() => TOKENS.find(t => t.mint === outputMint), [outputMint]);
  const amountUi = useMemo(() => parseFloat(amount || "0") || 0, [amount]);

  useEffect(() => {
    if (!amountUi || !outputToken) { setQuoteOut(null); setMinOut(null); return; }
    const q = amountUi; // simple preview 1:1
    const min = q * (1 - slippage / 100);
    setQuoteOut(q);
    setMinOut(min);
  }, [amountUi, outputToken, slippage]);

  const onSwap = useCallback(async () => {
    if (!publicKey || !signTransaction) return;
    if (busy) return;
    const now = Date.now();
    if (now - lastClickRef.current < 600) return;
    lastClickRef.current = now;

    try {
      setBusy(true);
      const amt = parseFloat(amount || "0");
      if (!amt || !inputToken || !outputToken) throw new Error("Enter amount and tokens");
      const base = BigInt(Math.round(amt * 10 ** inputToken.decimals));

      const payload = {
        amountLamports: base.toString(),
        payer: publicKey.toBase58(),
        inputMint,
        outputMint,
        slippagePercent: slippage,
      };

      let data: any = null;
      let lastErr: any = null;
      for (const b of getBackendCandidates()) {
        try {
          const res = await fetch(`${b}/api/swap/vault/prepare`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const ct = res.headers.get("content-type") || "";
          const body = ct.includes("application/json") ? await res.json() : await res.text();
          if (!res.ok) throw new Error(typeof body === "string" ? body : body?.error || `HTTP ${res.status}`);
          data = body; break;
        } catch (e) { lastErr = e; data = null; }
      }
      if (!data) throw lastErr || new Error("Failed to reach backend");

      const bytes = b64ToBytes(data.txBase64);
      const tx = VersionedTransaction.deserialize(bytes);
      const signed = await signTransaction(tx);

      const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
      const conn = new Connection(rpc, "confirmed");
      const sig = await conn.sendRawTransaction(signed.serialize());
      alert(`Submitted: ${sig}`);
    } catch (e: any) {
      console.error(e);
      alert(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }, [publicKey, signTransaction, busy, amount, inputMint, outputMint, inputToken, outputToken, slippage]);

  const swapEnabled = Boolean(publicKey && amountUi > 0 && inputMint && outputMint && inputMint !== outputMint);

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">Swap</h1>
      <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-zinc-300 mb-1">From</label>
            <select className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm focus:outline-none" value={inputMint} onChange={e => setInputMint(e.target.value)}>
              {TOKENS.map(t => (<option key={t.mint} value={t.mint}>{t.symbol}</option>))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-zinc-300 mb-1">To</label>
            <select className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm focus:outline-none" value={outputMint} onChange={e => setOutputMint(e.target.value)}>
              {TOKENS.map(t => (<option key={t.mint} value={t.mint}>{t.symbol}</option>))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm text-zinc-300 mb-1">Amount</label>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.0"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-lg focus:outline-none"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm text-zinc-300">Slippage</label>
            <div className="flex items-center gap-2">
              {SLIPPAGE_PRESETS.map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setSlippage(pct)}
                  className={clsx(
                    "rounded-md border px-2 py-1 text-xs",
                    pct === slippage ? "border-emerald-400 bg-emerald-500/10 text-emerald-200" : "border-zinc-700 text-zinc-300 hover:border-zinc-600"
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
              className="w-full rounded-lg bg-zinc-800 px-3 py-2 pr-10 focus:outline-none"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">%</span>
          </div>
        </div>

        <div className="rounded-lg bg-zinc-800/60 p-3 text-sm text-zinc-300">
          <div className="flex justify-between">
            <span>Estimate</span>
            <span>{quoteOut != null ? `${quoteOut.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${outputToken?.symbol ?? ""}` : "-"}</span>
          </div>
          <div className="flex justify-between">
            <span>Min received</span>
            <span>{minOut != null ? `${minOut.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${outputToken?.symbol ?? ""}` : "-"}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => { if (!swapEnabled) return; onSwap(); }}
          className={clsx(
            "w-full rounded-lg bg-emerald-600 py-3 text-center text-base font-medium text-white shadow-md",
            "transition-transform duration-100",
            "hover:brightness-110 active:scale-[0.99]",
            busy && "pointer-events-none"
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
    </div>
  );
}