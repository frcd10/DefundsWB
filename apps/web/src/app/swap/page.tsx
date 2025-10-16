"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Connection, VersionedTransaction } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";

type Token = { mint: string; symbol: string; decimals: number };
const TOKENS: Token[] = [
  { mint: "So11111111111111111111111111111111111111112", symbol: "SOL", decimals: 9 },
  { mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", symbol: "USDC", decimals: 6 },
  { mint: "Es9vMFrzaCERmJfrF4H2UVEcN8sELxzAoLTW2Z7KXJ3", symbol: "USDT", decimals: 6 },
];

const SLIPPAGE_PRESETS = [1, 5, 10, 50];

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function backendCandidates(): string[] {
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
      for (const b of backendCandidates()) {
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
      // eslint-disable-next-line no-alert
      alert(`Submitted: ${sig}`);
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error(e);
      // eslint-disable-next-line no-alert
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
                  className={cx(
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
          className={cx(
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
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Connection, VersionedTransaction } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";

// Simple token list for demo; replace with your token registry as needed
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
  // fallback for SSR or Node
  const buf = Buffer.from(b64, "base64");
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

export default function SwapPage() {
  const { publicKey, signTransaction } = useWallet();

  const [inputMint, setInputMint] = useState<string>(TOKENS[0].mint);
  const [outputMint, setOutputMint] = useState<string>(TOKENS[1].mint);
  const [amount, setAmount] = useState<string>("");
  const [slippagePercent, setSlippagePercent] = useState<number>(1);
  const [quoteOut, setQuoteOut] = useState<number | null>(null);
  const [minOut, setMinOut] = useState<number | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const clickGuardRef = useRef<number>(0);

  const inputToken = useMemo(() => TOKENS.find(t => t.mint === inputMint), [inputMint]);
  const outputToken = useMemo(() => TOKENS.find(t => t.mint === outputMint), [outputMint]);
  const amountUi = useMemo(() => parseFloat(amount || "0") || 0, [amount]);

  useEffect(() => {
    if (!amountUi || !outputToken) {
      setQuoteOut(null);
      setMinOut(null);
      return;
    }
    const q = amountUi; // simple 1:1 estimate for preview
    const min = q * (1 - slippagePercent / 100);
    setQuoteOut(q);
    setMinOut(min);
  }, [amountUi, outputToken, slippagePercent]);

  const onSwap = useCallback(async () => {
    if (!publicKey || !signTransaction) return;
    if (busy) return; // keep button bright; ignore double clicks

    try {
      setBusy(true);
      const amt = parseFloat(amount || "0");
      if (!amt || !inputToken || !outputToken) throw new Error("Enter amount and tokens");

      // convert UI to base units
      const base = BigInt(Math.round(amt * 10 ** inputToken.decimals));

      const payload = {
        amountLamports: base.toString(),
        payer: publicKey.toBase58(),
        inputMint,
        outputMint,
        slippagePercent, // server converts percent -> bps
      };

      const bases = getBackendCandidates();
      let json: any = null;
      let lastErr: any = null;
      for (const b of bases) {
        try {
          const res = await fetch(`${b}/api/swap/vault/prepare`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const ct = res.headers.get("content-type") || "";
          const data = ct.includes("application/json") ? await res.json() : await res.text();
          if (!res.ok) throw new Error(typeof data === "string" ? data : data?.error || `HTTP ${res.status}`);
          json = data;
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          json = null;
        }
      }
      if (!json) throw lastErr || new Error("Failed to reach backend");

      const txBytes = b64ToBytes(json.txBase64);
      const tx = VersionedTransaction.deserialize(txBytes);
      const signed = await signTransaction(tx);

      const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
      const conn = new Connection(rpc, "confirmed");
      const sig = await conn.sendRawTransaction(signed.serialize());
      console.log("Swap signature:", sig);
      alert(`Submitted: ${sig}`);
    } catch (e: any) {
      console.error(e);
      alert(e?.message || String(e));
    } finally {
      setBusy(false);
      clickGuardRef.current = Date.now();
    }
  }, [publicKey, signTransaction, busy, amount, inputMint, outputMint, inputToken, outputToken, slippagePercent]);

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
                  onClick={() => setSlippagePercent(pct)}
                  className={clsx(
                    "rounded-md border px-2 py-1 text-xs",
                    pct === slippagePercent ? "border-emerald-400 bg-emerald-500/10 text-emerald-200" : "border-zinc-700 text-zinc-300 hover:border-zinc-600"
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
              value={String(slippagePercent)}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9.]/g, "");
                const n = parseFloat(v);
                if (!Number.isNaN(n)) setSlippagePercent(n);
                else if (v === "") setSlippagePercent(0);
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
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Connection, VersionedTransaction } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";

type Token = { mint: string; symbol: string; decimals: number };

const TOKENS: Token[] = [
  { mint: "So11111111111111111111111111111111111111112", symbol: "SOL", decimals: 9 },
  { mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", symbol: "USDC", decimals: 6 },
  { mint: "Es9vMFrzaCERmJfrF4H2UVEcN8sELxzAoLTW2Z7KXJ3", symbol: "USDT", decimals: 6 },
];

const SLIPPAGE_PRESETS = [1, 5, 10, 50];

function cn(...xs: Array<string | false | null | undefined>) {
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
  "use client";

  import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
  import { Connection, VersionedTransaction } from "@solana/web3.js";
  import { useWallet } from "@solana/wallet-adapter-react";

  // Minimal token list; extend as needed
  type Token = { mint: string; symbol: string; decimals: number };
  const TOKENS: Token[] = [
    { mint: "So11111111111111111111111111111111111111112", symbol: "SOL", decimals: 9 },
    { mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", symbol: "USDC", decimals: 6 },
    { mint: "Es9vMFrzaCERmJfrF4H2UVEcN8sELxzAoLTW2Z7KXJ3", symbol: "USDT", decimals: 6 },
  ];

  const SLIPPAGE_PRESETS = [1, 5, 10, 50];

  function cn(...xs: Array<string | false | null | undefined>) {
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

    // UI state
    const [inputMint, setInputMint] = useState<string>(TOKENS[0].mint);
    const [outputMint, setOutputMint] = useState<string>(TOKENS[1].mint);
    const [amount, setAmount] = useState<string>("");
    const [slippagePercent, setSlippagePercent] = useState<number>(1);
    const [quoteOut, setQuoteOut] = useState<number | null>(null);
    const [minOut, setMinOut] = useState<number | null>(null);
    const [busy, setBusy] = useState<boolean>(false);
    const clickGuardRef = useRef<number>(0);

    const inputToken = useMemo(() => TOKENS.find(t => t.mint === inputMint), [inputMint]);
    const outputToken = useMemo(() => TOKENS.find(t => t.mint === outputMint), [outputMint]);
    const amountUi = useMemo(() => parseFloat(amount || "0") || 0, [amount]);

    // Simple local estimate for preview only (1:1 minus slippage)
    useEffect(() => {
      if (!amountUi || !outputToken) {
        setQuoteOut(null);
        setMinOut(null);
        return;
      }
      const q = amountUi;
      const min = q * (1 - slippagePercent / 100);
      setQuoteOut(q);
      setMinOut(min);
    }, [amountUi, outputToken, slippagePercent]);

    const onSwap = useCallback(async () => {
      if (!publicKey || !signTransaction) return;

      // Guard double clicks without greying button
      if (busy) return;
      const last = clickGuardRef.current;
      const now = Date.now();
      if (now - last < 600) return;

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
          slippagePercent, // server converts to bps
        };

        const bases = getBackendCandidates();
        let json: any = null;
        let lastErr: any = null;
        for (const b of bases) {
          try {
            const res = await fetch(`${b}/api/swap/vault/prepare`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            const ct = res.headers.get("content-type") || "";
            const data = ct.includes("application/json") ? await res.json() : await res.text();
            if (!res.ok) throw new Error(typeof data === "string" ? data : data?.error || `HTTP ${res.status}`);
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-zinc-300 mb-1">From</label>
            <select className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm focus:outline-none" value={inputMint} onChange={e => setInputMint(e.target.value)}>
              {TOKENS.map(t => (<option key={t.mint} value={t.mint}>{t.symbol}</option>))}
          }
        }
        if (!json) throw lastErr || new Error("Failed to reach backend");

        const txBytes = b64ToBytes(json.txBase64);
        const tx = VersionedTransaction.deserialize(txBytes);
        const signed = await signTransaction(tx);

        const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
        const conn = new Connection(rpc, "confirmed");
        const sig = await conn.sendRawTransaction(signed.serialize());
        // eslint-disable-next-line no-console
        console.log("Swap signature:", sig);
        alert(`Submitted: ${sig}`);
      } catch (e: any) {
        // eslint-disable-next-line no-console
        console.error(e);
        alert(e?.message || String(e));
      } finally {
        setBusy(false);
        clickGuardRef.current = Date.now();
      }
    }, [publicKey, signTransaction, busy, amount, inputMint, outputMint, inputToken, outputToken, slippagePercent]);

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
                    onClick={() => setSlippagePercent(pct)}
                    className={cn(
                      "rounded-md border px-2 py-1 text-xs",
                      pct === slippagePercent ? "border-emerald-400 bg-emerald-500/10 text-emerald-200" : "border-zinc-700 text-zinc-300 hover:border-zinc-600"
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
                value={String(slippagePercent)}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9.]/g, "");
                  const n = parseFloat(v);
                  if (!Number.isNaN(n)) setSlippagePercent(n);
                  else if (v === "") setSlippagePercent(0);
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
            className={cn(
              "w-full rounded-lg bg-emerald-600 py-3 text-center text-base font-medium text-white shadow-md",
              "transition-transform duration-100",
              "hover:brightness-110 active:scale-[0.99]",
              busy && "pointer-events-none"
            )}
          >
            {busy ? "Swapping..." : "Swap"}
          </button>

          {/* Remove number input arrows globally (no greying) */}
          <style jsx global>{`
            input[type=number]::-webkit-outer-spin-button,
            input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
            input[type=number] { -moz-appearance: textfield; }
          `}</style>
        </div>
      </div>
    );
  }
    const proto = window.location.protocol;
    const port = (process.env.NEXT_PUBLIC_BACKEND_PORT || "3001").trim();
    list.push(`${proto}//${host}:${port}`);
    if (port !== "10000") list.push(`${proto}//${host}:10000`);
  } else {
    const port = (process.env.NEXT_PUBLIC_BACKEND_PORT || "3001").trim();
    list.push(`http://localhost:${port}`);
    if (port !== "10000") list.push(`http://localhost:10000`);
  }
  // De-dup
  return Array.from(new Set(list));
}

async function fetchJSONWithFallback(path: string, init?: RequestInit): Promise<any> {
  const bases = getBackendCandidates();
  let lastErr: any = null;
  for (const base of bases) {
    try {
      const res = await fetch(`${base}${path}`, init);
      const ct = res.headers.get("content-type") || "";
      const data = ct.includes("application/json") ? await res.json() : await res.text();
      if (!res.ok) throw new Error(typeof data === "string" ? data : data?.error || `HTTP ${res.status}`);
      return data;
    } catch (e) {
      lastErr = e;
      continue;
    }
  }
  throw lastErr || new Error("Failed to reach backend");
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function b64ToBytes(b64: string): Uint8Array {
  if (typeof atob === "function") {
    const bin = atob(b64);
    const len = bin.length;
    const out = new Uint8Array(len);
    for (let i = 0; i < len; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  // Fallback if atob not available
  const buf = Buffer.from(b64, "base64");
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

export default function SwapPage() {
  const { publicKey, signTransaction } = useWallet();

  const [tokens] = useState<Token[]>(DEFAULT_TOKENS);
  const [inputMint, setInputMint] = useState<string>(DEFAULT_TOKENS[0].mint);
  const [outputMint, setOutputMint] = useState<string>(DEFAULT_TOKENS[2].mint);
  const [amount, setAmount] = useState<string>("");
  const [slippagePct, setSlippagePct] = useState<number>(1);
  const [quoteOut, setQuoteOut] = useState<number | null>(null);
  const [minOut, setMinOut] = useState<number | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const clickGuardRef = useRef<number>(0);

  const inputToken = useMemo(() => tokens.find(t => t.mint === inputMint), [tokens, inputMint]);
  const outputToken = useMemo(() => tokens.find(t => t.mint === outputMint), [tokens, outputMint]);

  const amountUi = useMemo(() => parseFloat(amount || "0") || 0, [amount]);

  useEffect(() => {
    // Basic preview math: fake quote 1:1 for now, minOut = quote * (1 - slippage)
    if (!amountUi || !outputToken) {
      setQuoteOut(null);
      setMinOut(null);
      return;
    }
    const q = amountUi; // pretend 1:1
    const min = q * (1 - slippagePct / 100);
    setQuoteOut(q);
    setMinOut(min);
  }, [amountUi, outputToken, slippagePct]);

  const onSwap = useCallback(async () => {
    if (!publicKey || !signTransaction) return;
    if (busy) return; // guard double clicks without greying out

    try {
      setBusy(true);
      const payer = publicKey.toBase58();
      const amt = parseFloat(amount || "0");
      if (!amt || !inputToken || !outputToken) throw new Error("Missing amount or tokens");

      // Convert UI amount to base units (lamports for SOL or decimals for SPL)
      const baseUnits = BigInt(Math.round(amt * 10 ** inputToken.decimals));
      const body = {
        amountLamports: baseUnits.toString(),
        payer,
        inputMint,
        outputMint,
        // slippagePercent as user-facing percentage; backend will convert to bps
        slippagePercent: slippagePct,
      };

      const resp = await fetchJSONWithFallback("/api/swap/vault/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const { txBase64 } = resp || {};
      if (!txBase64) throw new Error("No transaction returned");

      // Deserialize using Uint8Array (no Buffer requirement)
      const txBytes = b64ToBytes(txBase64);
      const tx = VersionedTransaction.deserialize(txBytes);

      // Sign with wallet
      const signed = await signTransaction(tx);

      // Send
      const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
      const conn = new Connection(rpc, "confirmed");
      const sig = await conn.sendRawTransaction(signed.serialize());

      console.log("Swap signature:", sig);
      alert(`Submitted: ${sig}`);
    } catch (e: any) {
      console.error(e);
      alert(e?.message || String(e));
    } finally {
      setBusy(false);
      clickGuardRef.current = Date.now();
    }
  }, [publicKey, signTransaction, busy, amount, inputToken, outputToken, inputMint, outputMint, slippagePct]);

  const swapEnabled = Boolean(publicKey && amountUi > 0 && inputMint && outputMint && inputMint !== outputMint);

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">Swap</h1>

      <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-zinc-300 mb-1">From</label>
            <select
              className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm focus:outline-none"
              value={inputMint}
              onChange={(e) => setInputMint(e.target.value)}
            >
              {tokens.map((t) => (
                <option key={t.mint} value={t.mint}>{t.symbol}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-zinc-300 mb-1">To</label>
            <select
              className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm focus:outline-none"
              value={outputMint}
              onChange={(e) => setOutputMint(e.target.value)}
            >
              {tokens.map((t) => (
                <option key={t.mint} value={t.mint}>{t.symbol}</option>
              ))}
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
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9.]/g, "");
              setAmount(v);
            }}
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
                  onClick={() => setSlippagePct(pct)}
                  className={cn(
                    "rounded-md border px-2 py-1 text-xs",
                    pct === slippagePct
                      ? "border-emerald-400 bg-emerald-500/10 text-emerald-200"
                      : "border-zinc-700 text-zinc-300 hover:border-zinc-600"
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
              value={String(slippagePct)}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9.]/g, "");
                const n = parseFloat(v);
                if (!Number.isNaN(n)) setSlippagePct(n);
                else if (v === "") setSlippagePct(0);
              }}
              className="w-full rounded-lg bg-zinc-800 px-3 py-2 pr-10 focus:outline-none"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">%</span>
          </div>
        </div>

        <div className="rounded-lg bg-zinc-800/60 p-3 text-sm text-zinc-300">
          <div className="flex justify-between"><span>Estimate</span><span>{quoteOut != null ? `${formatNumber(quoteOut)} ${outputToken?.symbol ?? ""}` : "-"}</span></div>
          <div className="flex justify-between"><span>Min received</span><span>{minOut != null ? `${formatNumber(minOut)} ${outputToken?.symbol ?? ""}` : "-"}</span></div>
        </div>

        <button
          type="button"
          onClick={() => { if (!swapEnabled) return; onSwap(); }}
          className={cn(
            "w-full rounded-lg bg-emerald-600 py-3 text-center text-base font-medium text-white shadow-md",
            "transition-transform duration-100",
            "hover:brightness-110 active:scale-[0.99]",
            busy && "pointer-events-none"
          )}
        >
          {busy ? "Swapping..." : "Swap"}
        </button>
      </div>
    </div>
  );
}
'use client';

import { useEffect, useMemo, useState } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWallet } from '@solana/wallet-adapter-react';
import { Connection, VersionedTransaction } from '@solana/web3.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TokenPicker } from '@/components/TokenPicker';
import { findTokenByMint, fromBaseUnits, toBaseUnits, getCluster } from '@/data/tokenlist';

const SOL_MINT = 'So11111111111111111111111111111111111111112';

type FundRow = { fundId: string; name?: string } & Record<string, unknown>;

export default function SwapPage() {
  const wallet = useWallet();
  const [eligible, setEligible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [funds, setFunds] = useState<FundRow[]>([]);

  // Form state
  const [selectedFundId, setSelectedFundId] = useState<string>('');
  const [sellMint, setSellMint] = useState<string>(SOL_MINT);
  const [buyMint, setBuyMint] = useState<string>('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  const [amountUi, setAmountUi] = useState<string>('0.10');
  const [slippagePercent, setSlippagePercent] = useState<number>(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quoteOut, setQuoteOut] = useState<string | null>(null);
  const [minReceived, setMinReceived] = useState<string | null>(null);
  const cluster = useMemo(() => getCluster(), []);

  // Manager eligibility + funds
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

  // Quote preview (mainnet only)
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setQuoteOut(null); setMinReceived(null);
      const isMainnet = String(cluster).toLowerCase() === 'mainnet-beta';
      if (!isMainnet) return;
      try {
        const sellDec = findTokenByMint(sellMint)?.decimals ?? 9;
        const parsedUi = parseFloat(amountUi || '0');
        if (!isFinite(parsedUi) || parsedUi <= 0) return;
        const amountBn = toBaseUnits(parsedUi, sellDec);
        if (amountBn === BigInt(0)) return;
        const slippageBps = Math.round(slippagePercent * 100);
        const url = (typeof window !== 'undefined'
          ? (process.env.NEXT_PUBLIC_JUPITER_QUOTE || 'https://lite-api.jup.ag/swap/v1/quote')
          : (process.env.JUPITER_PROXY_QUOTE || '/api/jupiter/quote'))
          + `?inputMint=${sellMint}&outputMint=${buyMint}&amount=${amountBn.toString()}&slippageBps=${slippageBps}`;
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const out = data?.outAmount ? String(data.outAmount) : null;
        setQuoteOut(out);
        if (out) {
          const min = Math.floor(Number(out) * (1 - slippageBps / 10000));
          setMinReceived(String(min));
        }
      } catch {
        // ignore preview errors
      }
    };
    run();
    return () => { cancelled = true; };
  }, [sellMint, buyMint, amountUi, slippagePercent, cluster]);

  const onSwap = async () => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      setError('Wallet not ready');
      return;
    }
    if (busy) return; // keep button bright; just ignore extra clicks
    setBusy(true); setMessage(null); setError(null);
    try {
      const sellDec = findTokenByMint(sellMint)?.decimals ?? 9;
      const parsedUi = parseFloat(amountUi || '0');
      if (!isFinite(parsedUi) || parsedUi <= 0) throw new Error('Enter a valid amount');
      const amountBn = toBaseUnits(parsedUi, sellDec);
      if (amountBn === BigInt(0)) throw new Error('Amount too small');

      const payer = wallet.publicKey.toBase58();
      const fundPda = selectedFundId;
      if (!fundPda) throw new Error('No fund selected');

      // Try multiple backend bases to reduce Failed to fetch in dev
      const candidates: string[] = [];
      const explicit = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (explicit) candidates.push(explicit);
      if (typeof window !== 'undefined') {
        const proto = window.location.protocol;
        const host = window.location.hostname;
        const envPort = process.env.NEXT_PUBLIC_BACKEND_PORT || '3001';
        candidates.push(`${proto}//${host}:${envPort}`);
        if (envPort !== '10000') candidates.push(`${proto}//${host}:10000`);
      } else {
        const envPort = process.env.NEXT_PUBLIC_BACKEND_PORT || '3001';
        candidates.push(`http://localhost:${envPort}`);
        if (envPort !== '10000') candidates.push(`http://localhost:10000`);
      }

      let json: any = null;
      let lastErr: any = null;
      for (const base of candidates) {
        try {
          const res = await fetch(`${base}/api/swap/vault/prepare`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              amountLamports: Number(amountBn),
              payer,
              inputMint: sellMint,
              outputMint: buyMint,
              fundPda,
              slippagePercent,
            }),
          });
          const contentType = res.headers.get('content-type') || '';
          if (!contentType.includes('application/json')) {
            const txt = await res.text();
            throw new Error(`Non-JSON from ${base}: ${txt.slice(0, 200)}`);
          }
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || `prepare failed via ${base}`);
          json = data;
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          json = null;
          continue;
        }
      }
      if (!json) throw lastErr || new Error('Failed to reach backend');

      const tx = VersionedTransaction.deserialize(Buffer.from(json.txBase64, 'base64'));
      const signed = await wallet.signTransaction(tx);

      const endpoint = (process.env.NEXT_PUBLIC_SOLANA_RPC_URL || `${window.location.origin}/api/rpc`);
      const conn = new Connection(endpoint, { commitment: 'confirmed' });
      const sig = await conn.sendRawTransaction(signed.serialize(), { skipPreflight: false, maxRetries: 3 });
      setMessage(sig);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  // Hydration-safe gate
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!wallet.connected || !mounted) {
    return (
      <div className="min-h-screen bg-brand-black text-white">
        <div className="max-w-4xl mx-auto px-4 py-16">
          <div className="rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10">
            <div className="py-12 px-6 flex flex-col items-center gap-4">
              <p className="text-white/70">Connect your wallet to access the Swap page.</p>
              {mounted ? (
                <WalletMultiButton className="!bg-brand-yellow !text-brand-black !rounded-full !px-6 !py-3 !h-auto !text-sm hover:!brightness-110 !font-semibold" />
              ) : (
                <button className="!bg-brand-yellow !text-brand-black !rounded-full !px-6 !py-3 !h-auto !text-sm font-semibold opacity-70 cursor-default">Select Wallet</button>
              )}
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
        <h1 className="text-3xl font-extrabold mb-6">Swap - V1</h1>

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
              <div className="inline-flex bg_white/5 border border-white/10 rounded-full overflow-hidden">
                {[1,5,10,50].map((pct) => (
                  <button key={pct} type="button" onClick={() => setSlippagePercent(pct)} className={`px-3 py-1 text-xs ${slippagePercent===pct?'bg-brand-yellow text-brand-black':'text-white/70 hover:text-white'}`}>{pct}%</button>
                ))}
              </div>
              <input
                type="number"
                min={0}
                max={50}
                step={1}
                inputMode="numeric"
                value={slippagePercent}
                onChange={(e) => setSlippagePercent(Math.max(0, Math.min(50, Number(e.target.value||1))))}
                className="w-16 rounded-md bg-black/30 border border-white/10 text-right appearance-none text-xs px-2 py-1"
              />
              <div className="text-xs text_white/40">%</div>
            </div>
          </div>

          {(quoteOut || minReceived || (String(cluster).toLowerCase() !== 'mainnet-beta')) && (
            <div className="rounded-xl bg-black/30 border border-white/10 p-3 text-xs text-white/70">
              {(() => {
                const outDec = findTokenByMint(buyMint)?.decimals ?? 9;
                const outUi = quoteOut ? fromBaseUnits(quoteOut, outDec) : undefined;
                const minUi = minReceived ? fromBaseUnits(minReceived, outDec) : undefined;
                const isMainnet = String(cluster).toLowerCase() === 'mainnet-beta';
                const slippageBps = Math.round(slippagePercent * 100);
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

          <Button
            onClick={onSwap}
            className={`w-full rounded-full bg-brand-yellow text-brand-black font-semibold shadow-[0_3px_18px_rgba(246,210,58,0.35)] hover:brightness-110 active:scale-[0.98] transition ${busy ? 'pointer-events-none' : ''}`}
          >
            {busy ? 'Swapping…' : 'Swap'}
          </Button>

          {message && (
            <div className="text-green-400 text-sm break-all">
              <a className="underline" href={`https://solscan.io/tx/${message}`} target="_blank" rel="noreferrer">{message}</a>
            </div>
          )}
          {error && <div className="text-red-400 text-sm break-all">{error}</div>}
        </div>

        {/* Hide number input arrows globally */}
        <style jsx global>{`
          input[type=number]::-webkit-outer-spin-button,
          input[type=number]::-webkit-inner-spin-button {
            -webkit-appearance: none;
            margin: 0;
          }
          input[type=number] { -moz-appearance: textfield; }
        `}</style>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWallet } from '@solana/wallet-adapter-react';
import { Connection, VersionedTransaction } from '@solana/web3.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TokenPicker } from '@/components/TokenPicker';
import { findTokenByMint, fromBaseUnits, toBaseUnits, getCluster } from '@/data/tokenlist';

const SOL_MINT = 'So11111111111111111111111111111111111111112';

type FundRow = { fundId: string; name?: string } & Record<string, unknown>;

export default function SwapPage() {
  const wallet = useWallet();
  const [eligible, setEligible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [funds, setFunds] = useState<FundRow[]>([]);

  // Form state
  const [selectedFundId, setSelectedFundId] = useState<string>('');
  const [sellMint, setSellMint] = useState<string>(SOL_MINT);
  const [buyMint, setBuyMint] = useState<string>('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  const [amountUi, setAmountUi] = useState<string>('0.10');
  const [slippagePercent, setSlippagePercent] = useState<number>(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quoteOut, setQuoteOut] = useState<string | null>(null);
  const [minReceived, setMinReceived] = useState<string | null>(null);
  const cluster = useMemo(() => getCluster(), []);

  // Manager eligibility + funds
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

  // Quote preview (mainnet only)
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setQuoteOut(null); setMinReceived(null);
      const isMainnet = String(cluster).toLowerCase() === 'mainnet-beta';
      if (!isMainnet) return;
      try {
        const sellDec = findTokenByMint(sellMint)?.decimals ?? 9;
        const parsedUi = parseFloat(amountUi || '0');
        if (!isFinite(parsedUi) || parsedUi <= 0) return;
        const amountBn = toBaseUnits(parsedUi, sellDec);
        if (amountBn === BigInt(0)) return;
        const slippageBps = Math.round(slippagePercent * 100);
        const url = (typeof window !== 'undefined'
          ? (process.env.NEXT_PUBLIC_JUPITER_QUOTE || 'https://lite-api.jup.ag/swap/v1/quote')
          : (process.env.JUPITER_PROXY_QUOTE || '/api/jupiter/quote'))
          + `?inputMint=${sellMint}&outputMint=${buyMint}&amount=${amountBn.toString()}&slippageBps=${slippageBps}`;
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const out = data?.outAmount ? String(data.outAmount) : null;
        setQuoteOut(out);
        if (out) {
          const min = Math.floor(Number(out) * (1 - slippageBps / 10000));
          setMinReceived(String(min));
        }
      } catch {
        // ignore preview errors
      }
    };
    run();
    return () => { cancelled = true; };
  }, [sellMint, buyMint, amountUi, slippagePercent, cluster]);

  const onSwap = async () => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      setError('Wallet not ready');
      return;
    }
    if (busy) return; // keep button bright; just ignore extra clicks
    setBusy(true); setMessage(null); setError(null);
    try {
      const sellDec = findTokenByMint(sellMint)?.decimals ?? 9;
      const parsedUi = parseFloat(amountUi || '0');
      if (!isFinite(parsedUi) || parsedUi <= 0) throw new Error('Enter a valid amount');
      const amountBn = toBaseUnits(parsedUi, sellDec);
      if (amountBn === BigInt(0)) throw new Error('Amount too small');

      const payer = wallet.publicKey.toBase58();
      const fundPda = selectedFundId;
      if (!fundPda) throw new Error('No fund selected');

      // Try multiple backend bases to reduce Failed to fetch in dev
      const candidates: string[] = [];
      const explicit = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (explicit) candidates.push(explicit);
      if (typeof window !== 'undefined') {
        const proto = window.location.protocol;
        const host = window.location.hostname;
        const envPort = process.env.NEXT_PUBLIC_BACKEND_PORT || '3001';
        candidates.push(`${proto}//${host}:${envPort}`);
        if (envPort !== '10000') candidates.push(`${proto}//${host}:10000`);
      } else {
        const envPort = process.env.NEXT_PUBLIC_BACKEND_PORT || '3001';
        candidates.push(`http://localhost:${envPort}`);
        if (envPort !== '10000') candidates.push(`http://localhost:10000`);
      }

      let json: any = null;
      let lastErr: any = null;
      for (const base of candidates) {
        try {
          const res = await fetch(`${base}/api/swap/vault/prepare`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              amountLamports: Number(amountBn),
              payer,
              inputMint: sellMint,
              outputMint: buyMint,
              fundPda,
              slippagePercent,
            }),
          });
          const contentType = res.headers.get('content-type') || '';
          if (!contentType.includes('application/json')) {
            const txt = await res.text();
            throw new Error(`Non-JSON from ${base}: ${txt.slice(0, 200)}`);
          }
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || `prepare failed via ${base}`);
          json = data;
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          json = null;
          continue;
        }
      }
      if (!json) throw lastErr || new Error('Failed to reach backend');

      const tx = VersionedTransaction.deserialize(Buffer.from(json.txBase64, 'base64'));
      const signed = await wallet.signTransaction(tx);

      const endpoint = (process.env.NEXT_PUBLIC_SOLANA_RPC_URL || `${window.location.origin}/api/rpc`);
      const conn = new Connection(endpoint, { commitment: 'confirmed' });
      const sig = await conn.sendRawTransaction(signed.serialize(), { skipPreflight: false, maxRetries: 3 });
      setMessage(sig);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  // Hydration-safe gate
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!wallet.connected || !mounted) {
    return (
      <div className="min-h-screen bg-brand-black text-white">
        <div className="max-w-4xl mx-auto px-4 py-16">
          <div className="rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10">
            <div className="py-12 px-6 flex flex-col items-center gap-4">
              <p className="text-white/70">Connect your wallet to access the Swap page.</p>
              {mounted ? (
                <WalletMultiButton className="!bg-brand-yellow !text-brand-black !rounded-full !px-6 !py-3 !h-auto !text-sm hover:!brightness-110 !font-semibold" />
              ) : (
                <button className="!bg-brand-yellow !text-brand-black !rounded-full !px-6 !py-3 !h-auto !text-sm font-semibold opacity-70 cursor-default">Select Wallet</button>
              )}
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
        <h1 className="text-3xl font-extrabold mb-6">Swap - V1</h1>

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
                {[1,5,10,50].map((pct) => (
                  <button key={pct} type="button" onClick={() => setSlippagePercent(pct)} className={`px-3 py-1 text-xs ${slippagePercent===pct?'bg-brand-yellow text-brand-black':'text-white/70 hover:text-white'}`}>{pct}%</button>
                ))}
              </div>
              <input
                type="number"
                min={0}
                max={50}
                step={1}
                inputMode="numeric"
                value={slippagePercent}
                onChange={(e) => setSlippagePercent(Math.max(0, Math.min(50, Number(e.target.value||1))))}
                className="w-16 rounded-md bg-black/30 border border-white/10 text-right appearance-none text-xs px-2 py-1"
              />
              <div className="text-xs text-white/40">%</div>
            </div>
          </div>

          {(quoteOut || minReceived || (String(cluster).toLowerCase() !== 'mainnet-beta')) && (
            <div className="rounded-xl bg-black/30 border border-white/10 p-3 text-xs text-white/70">
              {(() => {
                const outDec = findTokenByMint(buyMint)?.decimals ?? 9;
                const outUi = quoteOut ? fromBaseUnits(quoteOut, outDec) : undefined;
                const minUi = minReceived ? fromBaseUnits(minReceived, outDec) : undefined;
                const isMainnet = String(cluster).toLowerCase() === 'mainnet-beta';
                const slippageBps = Math.round(slippagePercent * 100);
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

          <Button
            onClick={onSwap}
            className={`w-full rounded-full bg-brand-yellow text-brand-black font-semibold shadow-[0_3px_18px_rgba(246,210,58,0.35)] hover:brightness-110 active:scale-[0.98] transition ${busy ? 'pointer-events-none' : ''}`}
          >
            {busy ? 'Swapping…' : 'Swap'}
          </Button>

          {message && (
            <div className="text-green-400 text-sm break-all">
              <a className="underline" href={`https://solscan.io/tx/${message}`} target="_blank" rel="noreferrer">{message}</a>
            </div>
          )}
          {error && <div className="text-red-400 text-sm break-all">{error}</div>}
        </div>

        {/* Hide number input arrows globally */}
        <style jsx global>{`
          input[type=number]::-webkit-outer-spin-button,
          input[type=number]::-webkit-inner-spin-button {
            -webkit-appearance: none;
            margin: 0;
          }
          input[type=number] { -moz-appearance: textfield; }
        `}</style>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWallet } from '@solana/wallet-adapter-react';
import { Connection, VersionedTransaction } from '@solana/web3.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TokenPicker } from '@/components/TokenPicker';
import { findTokenByMint, fromBaseUnits, toBaseUnits, getCluster } from '@/data/tokenlist';

const SOL_MINT = 'So11111111111111111111111111111111111111112';

type FundRow = { fundId: string; name?: string } & Record<string, unknown>;

export default function SwapPage() {
  const wallet = useWallet();
  const [eligible, setEligible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [funds, setFunds] = useState<FundRow[]>([]);

  // Form state
  const [selectedFundId, setSelectedFundId] = useState<string>('');
  const [sellMint, setSellMint] = useState<string>(SOL_MINT);
  const [buyMint, setBuyMint] = useState<string>('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  const [amountUi, setAmountUi] = useState<string>('0.10');
  const [slippagePercent, setSlippagePercent] = useState<number>(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quoteOut, setQuoteOut] = useState<string | null>(null);
  const [minReceived, setMinReceived] = useState<string | null>(null);
  const cluster = useMemo(() => getCluster(), []);

  // Manager eligibility + funds
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

  // Quote preview (mainnet only)
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setQuoteOut(null); setMinReceived(null);
      const isMainnet = String(cluster).toLowerCase() === 'mainnet-beta';
      if (!isMainnet) return;
      try {
        const sellDec = findTokenByMint(sellMint)?.decimals ?? 9;
        const parsedUi = parseFloat(amountUi || '0');
        if (!isFinite(parsedUi) || parsedUi <= 0) return;
        const amountBn = toBaseUnits(parsedUi, sellDec);
        if (amountBn === BigInt(0)) return;
        const slippageBps = Math.round(slippagePercent * 100);
        const url = (typeof window !== 'undefined'
          ? (process.env.NEXT_PUBLIC_JUPITER_QUOTE || 'https://lite-api.jup.ag/swap/v1/quote')
          : (process.env.JUPITER_PROXY_QUOTE || '/api/jupiter/quote'))
          + `?inputMint=${sellMint}&outputMint=${buyMint}&amount=${amountBn.toString()}&slippageBps=${slippageBps}`;
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const out = data?.outAmount ? String(data.outAmount) : null;
        setQuoteOut(out);
        if (out) {
          const min = Math.floor(Number(out) * (1 - slippageBps / 10000));
          setMinReceived(String(min));
        }
      } catch {
        // ignore preview errors
      }
    };
    run();
    return () => { cancelled = true; };
  }, [sellMint, buyMint, amountUi, slippagePercent, cluster]);

  const onSwap = async () => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      setError('Wallet not ready');
      return;
    }
    if (busy) return; // keep button bright; just ignore extra clicks
    setBusy(true); setMessage(null); setError(null);
    try {
      const sellDec = findTokenByMint(sellMint)?.decimals ?? 9;
      const parsedUi = parseFloat(amountUi || '0');
      if (!isFinite(parsedUi) || parsedUi <= 0) throw new Error('Enter a valid amount');
      const amountBn = toBaseUnits(parsedUi, sellDec);
      if (amountBn === BigInt(0)) throw new Error('Amount too small');

      const payer = wallet.publicKey.toBase58();
      const fundPda = selectedFundId;
      if (!fundPda) throw new Error('No fund selected');

      // Try multiple backend bases to reduce Failed to fetch in dev
      const candidates: string[] = [];
      const explicit = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (explicit) candidates.push(explicit);
      if (typeof window !== 'undefined') {
        const proto = window.location.protocol;
        const host = window.location.hostname;
        const envPort = process.env.NEXT_PUBLIC_BACKEND_PORT || '3001';
        candidates.push(`${proto}//${host}:${envPort}`);
        if (envPort !== '10000') candidates.push(`${proto}//${host}:10000`);
      } else {
        const envPort = process.env.NEXT_PUBLIC_BACKEND_PORT || '3001';
        candidates.push(`http://localhost:${envPort}`);
        if (envPort !== '10000') candidates.push(`http://localhost:10000`);
      }

      let json: any = null;
      let lastErr: any = null;
      for (const base of candidates) {
        try {
          const res = await fetch(`${base}/api/swap/vault/prepare`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              amountLamports: Number(amountBn),
              payer,
              inputMint: sellMint,
              outputMint: buyMint,
              fundPda,
              slippagePercent,
            }),
          });
          const contentType = res.headers.get('content-type') || '';
          if (!contentType.includes('application/json')) {
            const txt = await res.text();
            throw new Error(`Non-JSON from ${base}: ${txt.slice(0, 200)}`);
          }
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || `prepare failed via ${base}`);
          json = data;
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          json = null;
          continue;
        }
      }
      if (!json) throw lastErr || new Error('Failed to reach backend');

      const tx = VersionedTransaction.deserialize(Buffer.from(json.txBase64, 'base64'));
      const signed = await wallet.signTransaction(tx);

      const endpoint = (process.env.NEXT_PUBLIC_SOLANA_RPC_URL || `${window.location.origin}/api/rpc`);
      const conn = new Connection(endpoint, { commitment: 'confirmed' });
      const sig = await conn.sendRawTransaction(signed.serialize(), { skipPreflight: false, maxRetries: 3 });
      setMessage(sig);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  // Hydration-safe gate
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!wallet.connected || !mounted) {
    return (
      <div className="min-h-screen bg-brand-black text-white">
        <div className="max-w-4xl mx-auto px-4 py-16">
          <div className="rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10">
            <div className="py-12 px-6 flex flex-col items-center gap-4">
              <p className="text-white/70">Connect your wallet to access the Swap page.</p>
              {mounted ? (
                <WalletMultiButton className="!bg-brand-yellow !text-brand-black !rounded-full !px-6 !py-3 !h-auto !text-sm hover:!brightness-110 !font-semibold" />
              ) : (
                <button className="!bg-brand-yellow !text-brand-black !rounded-full !px-6 !py-3 !h-auto !text-sm font-semibold opacity-70 cursor-default">Select Wallet</button>
              )}
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
        <h1 className="text-3xl font-extrabold mb-6">Swap - V1</h1>

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
                {[1,5,10,50].map((pct) => (
                  <button key={pct} type="button" onClick={() => setSlippagePercent(pct)} className={`px-3 py-1 text-xs ${slippagePercent===pct?'bg-brand-yellow text-brand-black':'text-white/70 hover:text-white'}`}>{pct}%</button>
                ))}
              </div>
              <input
                type="number"
                min={0}
                max={50}
                step={1}
                inputMode="numeric"
                value={slippagePercent}
                onChange={(e) => setSlippagePercent(Math.max(0, Math.min(50, Number(e.target.value||1))))}
                className="w-16 rounded-md bg-black/30 border border-white/10 text-right appearance-none text-xs px-2 py-1"
              />
              <div className="text-xs text-white/40">%</div>
            </div>
          </div>

          {(quoteOut || minReceived || (String(cluster).toLowerCase() !== 'mainnet-beta')) && (
            <div className="rounded-xl bg-black/30 border border-white/10 p-3 text-xs text-white/70">
              {(() => {
                const outDec = findTokenByMint(buyMint)?.decimals ?? 9;
                const outUi = quoteOut ? fromBaseUnits(quoteOut, outDec) : undefined;
                const minUi = minReceived ? fromBaseUnits(minReceived, outDec) : undefined;
                const isMainnet = String(cluster).toLowerCase() === 'mainnet-beta';
                const slippageBps = Math.round(slippagePercent * 100);
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

          <Button
            onClick={onSwap}
            className={`w-full rounded-full bg-brand-yellow text-brand-black font-semibold shadow-[0_3px_18px_rgba(246,210,58,0.35)] hover:brightness-110 active:scale-[0.98] transition ${busy ? 'pointer-events-none' : ''}`}
          >
            {busy ? 'Swapping…' : 'Swap'}
          </Button>

          {message && (
            <div className="text-green-400 text-sm break-all">
              <a className="underline" href={`https://solscan.io/tx/${message}`} target="_blank" rel="noreferrer">{message}</a>
            </div>
          )}
          {error && <div className="text-red-400 text-sm break-all">{error}</div>}
        </div>

        {/* Hide number input arrows globally */}
        <style jsx global>{`
          input[type=number]::-webkit-outer-spin-button,
          input[type=number]::-webkit-inner-spin-button {
            -webkit-appearance: none;
            margin: 0;
          }
          input[type=number] { -moz-appearance: textfield; }
        `}</style>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWallet } from '@solana/wallet-adapter-react';
import { Connection, VersionedTransaction } from '@solana/web3.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TokenPicker } from '@/components/TokenPicker';
import { findTokenByMint, fromBaseUnits, toBaseUnits, getCluster } from '@/data/tokenlist';

const SOL_MINT = 'So11111111111111111111111111111111111111112';

type FundRow = { fundId: string; name?: string } & Record<string, unknown>;

export default function SwapPage() {
  const wallet = useWallet();
  const [eligible, setEligible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [funds, setFunds] = useState<FundRow[]>([]);

  // Form state
  const [selectedFundId, setSelectedFundId] = useState<string>('');
  const [sellMint, setSellMint] = useState<string>(SOL_MINT);
  const [buyMint, setBuyMint] = useState<string>('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  const [amountUi, setAmountUi] = useState<string>('0.10');
  const [slippagePercent, setSlippagePercent] = useState<number>(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quoteOut, setQuoteOut] = useState<string | null>(null);
  const [minReceived, setMinReceived] = useState<string | null>(null);
  const cluster = useMemo(() => getCluster(), []);

  // Manager eligibility + funds
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

  // Quote preview (mainnet only)
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setQuoteOut(null); setMinReceived(null);
      const isMainnet = String(cluster).toLowerCase() === 'mainnet-beta';
      if (!isMainnet) return;
      try {
        const sellDec = findTokenByMint(sellMint)?.decimals ?? 9;
        const parsedUi = parseFloat(amountUi || '0');
        if (!isFinite(parsedUi) || parsedUi <= 0) return;
        const amountBn = toBaseUnits(parsedUi, sellDec);
        if (amountBn === BigInt(0)) return;
        const slippageBps = Math.round(slippagePercent * 100);
        const url = (typeof window !== 'undefined'
          ? (process.env.NEXT_PUBLIC_JUPITER_QUOTE || 'https://lite-api.jup.ag/swap/v1/quote')
          : (process.env.JUPITER_PROXY_QUOTE || '/api/jupiter/quote'))
          + `?inputMint=${sellMint}&outputMint=${buyMint}&amount=${amountBn.toString()}&slippageBps=${slippageBps}`;
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const out = data?.outAmount ? String(data.outAmount) : null;
        setQuoteOut(out);
        if (out) {
          const min = Math.floor(Number(out) * (1 - slippageBps / 10000));
          setMinReceived(String(min));
        }
      } catch {
        // ignore preview errors
      }
    };
    run();
    return () => { cancelled = true; };
  }, [sellMint, buyMint, amountUi, slippagePercent, cluster]);

  const onSwap = async () => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      setError('Wallet not ready');
      return;
    }
    if (busy) return; // keep the button bright; just ignore double clicks
    setBusy(true); setMessage(null); setError(null);
    try {
      const sellDec = findTokenByMint(sellMint)?.decimals ?? 9;
      const parsedUi = parseFloat(amountUi || '0');
      if (!isFinite(parsedUi) || parsedUi <= 0) throw new Error('Enter a valid amount');
      const amountBn = toBaseUnits(parsedUi, sellDec);
      if (amountBn === BigInt(0)) throw new Error('Amount too small');

      const payer = wallet.publicKey.toBase58();
      const fundPda = selectedFundId;
      if (!fundPda) throw new Error('No fund selected');

      // Try multiple backend bases to reduce Failed to fetch in dev
      const candidates: string[] = [];
      const explicit = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (explicit) candidates.push(explicit);
      if (typeof window !== 'undefined') {
        const proto = window.location.protocol;
        const host = window.location.hostname;
        const envPort = process.env.NEXT_PUBLIC_BACKEND_PORT || '3001';
        candidates.push(`${proto}//${host}:${envPort}`);
        if (envPort !== '10000') candidates.push(`${proto}//${host}:10000`);
      } else {
        const envPort = process.env.NEXT_PUBLIC_BACKEND_PORT || '3001';
        candidates.push(`http://localhost:${envPort}`);
        if (envPort !== '10000') candidates.push(`http://localhost:10000`);
      }

      let json: any = null;
      let lastErr: any = null;
      for (const base of candidates) {
        try {
          const res = await fetch(`${base}/api/swap/vault/prepare`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              amountLamports: Number(amountBn),
              payer,
              inputMint: sellMint,
              outputMint: buyMint,
              fundPda,
              slippagePercent,
            }),
          });
          const contentType = res.headers.get('content-type') || '';
          if (!contentType.includes('application/json')) {
            const txt = await res.text();
            throw new Error(`Non-JSON from ${base}: ${txt.slice(0, 200)}`);
          }
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || `prepare failed via ${base}`);
          json = data;
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          json = null;
          continue;
        }
      }
      if (!json) throw lastErr || new Error('Failed to reach backend');

      const tx = VersionedTransaction.deserialize(Buffer.from(json.txBase64, 'base64'));
      const signed = await wallet.signTransaction(tx);

      const endpoint = (process.env.NEXT_PUBLIC_SOLANA_RPC_URL || `${window.location.origin}/api/rpc`);
      const conn = new Connection(endpoint, { commitment: 'confirmed' });
      const sig = await conn.sendRawTransaction(signed.serialize(), { skipPreflight: false, maxRetries: 3 });
      setMessage(sig);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  // Hydration-safe gate
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!wallet.connected || !mounted) {
    return (
      <div className="min-h-screen bg-brand-black text-white">
        <div className="max-w-4xl mx-auto px-4 py-16">
          <div className="rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10">
            <div className="py-12 px-6 flex flex-col items-center gap-4">
              <p className="text-white/70">Connect your wallet to access the Swap page.</p>
              {mounted ? (
                <WalletMultiButton className="!bg-brand-yellow !text-brand-black !rounded-full !px-6 !py-3 !h-auto !text-sm hover:!brightness-110 !font-semibold" />
              ) : (
                <button className="!bg-brand-yellow !text-brand-black !rounded-full !px-6 !py-3 !h-auto !text-sm font-semibold opacity-70 cursor-default">Select Wallet</button>
              )}
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
        <h1 className="text-3xl font-extrabold mb-6">Swap - V1</h1>

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
                {[1,5,10,50].map((pct) => (
                  <button key={pct} type="button" onClick={() => setSlippagePercent(pct)} className={`px-3 py-1 text-xs ${slippagePercent===pct?'bg-brand-yellow text-brand-black':'text-white/70 hover:text-white'}`}>{pct}%</button>
                ))}
              </div>
              <input
                type="number"
                min={0}
                max={50}
                step={1}
                inputMode="numeric"
                value={slippagePercent}
                onChange={(e) => setSlippagePercent(Math.max(0, Math.min(50, Number(e.target.value||1))))}
                className="w-16 rounded-md bg-black/30 border border-white/10 text-right appearance-none text-xs px-2 py-1"
              />
              <div className="text-xs text-white/40">%</div>
            </div>
          </div>

          {(quoteOut || minReceived || (String(cluster).toLowerCase() !== 'mainnet-beta')) && (
            <div className="rounded-xl bg-black/30 border border-white/10 p-3 text-xs text-white/70">
              {(() => {
                const outDec = findTokenByMint(buyMint)?.decimals ?? 9;
                const outUi = quoteOut ? fromBaseUnits(quoteOut, outDec) : undefined;
                const minUi = minReceived ? fromBaseUnits(minReceived, outDec) : undefined;
                const isMainnet = String(cluster).toLowerCase() === 'mainnet-beta';
                const slippageBps = Math.round(slippagePercent * 100);
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

          <Button
            onClick={onSwap}
            className={`w-full rounded-full bg-brand-yellow text-brand-black font-semibold shadow-[0_3px_18px_rgba(246,210,58,0.35)] hover:brightness-110 active:scale-[0.98] transition ${busy ? 'pointer-events-none' : ''}`}
          >
            {busy ? 'Swapping…' : 'Swap'}
          </Button>

          {message && (
            <div className="text-green-400 text-sm break-all">
              <a className="underline" href={`https://solscan.io/tx/${message}`} target="_blank" rel="noreferrer">{message}</a>
            </div>
          )}
          {error && <div className="text-red-400 text-sm break-all">{error}</div>}
        </div>

        {/* Hide number input arrows globally */}
        <style jsx global>{`
          input[type=number]::-webkit-outer-spin-button,
          input[type=number]::-webkit-inner-spin-button {
            -webkit-appearance: none;
            margin: 0;
          }
          input[type=number] { -moz-appearance: textfield; }
        `}</style>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, LAMPORTS_PER_SOL, Connection, VersionedTransaction } from '@solana/web3.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TokenPicker } from '@/components/TokenPicker';
import { findTokenByMint, fromBaseUnits, toBaseUnits, getCluster } from '@/data/tokenlist';
// Swap feature removed: UI disabled

const SOL_MINT = 'So11111111111111111111111111111111111111112';

type FundRow = { fundId: string; name?: string } & Record<string, unknown>;

export default function SwapPage() {
  const onSwap = async () => {
  const wallet = useWallet();
  const [eligible, setEligible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [funds, setFunds] = useState<FundRow[]>([]);

    if (busy) return; // guard against double-clicks without greying out
  // Form state (Jupiter-like)
  const [selectedFundId, setSelectedFundId] = useState<string>('');
  const [sellMint, setSellMint] = useState<string>(SOL_MINT);
  const [buyMint, setBuyMint] = useState<string>('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  const [amountUi, setAmountUi] = useState<string>('0.10');
  const [slippagePercent, setSlippagePercent] = useState<number>(1); // 1%
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quoteOut, setQuoteOut] = useState<string | null>(null);
  const [minReceived, setMinReceived] = useState<string | null>(null);
      // Build a list of candidate backend bases to try, to avoid Failed to fetch when backend runs on a different port
      const candidates: string[] = [];
      const explicit = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (explicit) candidates.push(explicit);
      if (typeof window !== 'undefined') {
        const proto = window.location.protocol;
        const host = window.location.hostname;
        const envPort = process.env.NEXT_PUBLIC_BACKEND_PORT || '3001';
        candidates.push(`${proto}//${host}:${envPort}`);
        if (envPort !== '10000') candidates.push(`${proto}//${host}:10000`);
      } else {
        const envPort = process.env.NEXT_PUBLIC_BACKEND_PORT || '3001';
        candidates.push(`http://localhost:${envPort}`);
        if (envPort !== '10000') candidates.push(`http://localhost:10000`);
      }

      let lastErr: any = null;
      let json: any = null;
      for (const base of candidates) {
        try {
          const res = await fetch(`${base}/api/swap/vault/prepare`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              amountLamports: Number(amountBn),
              payer,
              inputMint: sellMint,
              outputMint: buyMint,
              fundPda,
              slippagePercent,
            }),
          });
          const contentType = res.headers.get('content-type') || '';
          if (!contentType.includes('application/json')) {
            const txt = await res.text();
            throw new Error(`Non-JSON from ${base}: ${txt.slice(0, 180)}`);
          }
          json = await res.json();
          if (!res.ok) throw new Error(json.error || `prepare failed via ${base}`);
          // success
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          json = null;
          continue;
        }
      }
      if (!json) throw lastErr || new Error('Failed to reach backend');
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
        const slippageBps = Math.round(slippagePercent * 100);
        const url = (typeof window !== 'undefined'
          ? (process.env.NEXT_PUBLIC_JUPITER_QUOTE || 'https://lite-api.jup.ag/swap/v1/quote')
          : (process.env.JUPITER_PROXY_QUOTE || '/api/jupiter/quote'))
          + `?inputMint=${sellMint}&outputMint=${buyMint}&amount=${amountBn.toString()}&slippageBps=${slippageBps}`;
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
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
  }, [sellMint, buyMint, amountUi, slippagePercent, cluster]);

  const onSwap = async () => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      setError('Wallet not ready');
      return;
    }
    setBusy(true); setMessage(null); setError(null);
    try {
      const sellDec = findTokenByMint(sellMint)?.decimals ?? 9;
      const parsedUi = parseFloat(amountUi || '0');
      if (!isFinite(parsedUi) || parsedUi <= 0) throw new Error('Enter a valid amount');
      const amountBn = toBaseUnits(parsedUi, sellDec);
      if (amountBn === BigInt(0)) throw new Error('Amount too small');

      const payer = wallet.publicKey.toBase58();
      const fundPda = selectedFundId;
      if (!fundPda) throw new Error('No fund selected');
      const backendBase = process.env.NEXT_PUBLIC_BACKEND_URL
        || (typeof window !== 'undefined'
    if (busy) return; // don't disable; just ignore extra clicks
              ? `${window.location.protocol}//${window.location.hostname}:${process.env.NEXT_PUBLIC_BACKEND_PORT || '3001'}`
              : `http://localhost:${process.env.NEXT_PUBLIC_BACKEND_PORT || '3001'}`);
      const url = `${backendBase}/api/swap/vault/prepare`;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountLamports: Number(amountBn),
          payer,
          inputMint: sellMint,
      const contentType = res.headers.get('content-type') || '';
      // Try multiple backend bases to reduce Failed to fetch in dev environments
      const candidates: string[] = [];
      const explicit = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (explicit) candidates.push(explicit);
      if (typeof window !== 'undefined') {
        const proto = window.location.protocol;
        const host = window.location.hostname;
        const envPort = process.env.NEXT_PUBLIC_BACKEND_PORT || '3001';
        candidates.push(`${proto}//${host}:${envPort}`);
        if (envPort !== '10000') candidates.push(`${proto}//${host}:10000`);
      } else {
        const envPort = process.env.NEXT_PUBLIC_BACKEND_PORT || '3001';
        candidates.push(`http://localhost:${envPort}`);
        if (envPort !== '10000') candidates.push(`http://localhost:10000`);
      }

      let json: any = null;
      let lastErr: any = null;
      for (const base of candidates) {
        try {
          const res = await fetch(`${base}/api/swap/vault/prepare`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              amountLamports: Number(amountBn),
              payer,
              inputMint: sellMint,
              outputMint: buyMint,
              fundPda,
              slippagePercent,
            }),
          });
          const contentType = res.headers.get('content-type') || '';
          if (!contentType.includes('application/json')) {
            const txt = await res.text();
            throw new Error(`Non-JSON from ${base}: ${txt.slice(0, 200)}`);
          }
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || `prepare failed via ${base}`);
          json = data;
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          json = null;
          continue;
        }
      }
      if (!json) throw lastErr || new Error('Failed to reach backend');

  // Hydration-safe gate: render wallet UI only after mount
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // UI States
  if (!wallet.connected || !mounted) {
    return (
      <div className="min-h-screen bg-brand-black text-white">
        <div className="max-w-4xl mx-auto px-4 py-16">
          <div className="rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10">
            <div className="py-12 px-6 flex flex-col items-center gap-4">
              <p className="text-white/70">Connect your wallet to access the Swap page.</p>
              {mounted ? (
                <WalletMultiButton className="!bg-brand-yellow !text-brand-black !rounded-full !px-6 !py-3 !h-auto !text-sm hover:!brightness-110 !font-semibold" />
              ) : (
                <button className="!bg-brand-yellow !text-brand-black !rounded-full !px-6 !py-3 !h-auto !text-sm font-semibold opacity-70 cursor-default">Select Wallet</button>
              )}
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
  <h1 className="text-3xl font-extrabold mb-6">Swap - V1</h1>

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
                {[1,5,10,50].map((pct) => (
                  <button key={pct} type="button" onClick={() => setSlippagePercent(pct)} className={`px-3 py-1 text-xs ${slippagePercent===pct?'bg-brand-yellow text-brand-black':'text-white/70 hover:text-white'}`}>{pct}%</button>
                ))}
              </div>
              <input
                type="number"
                min={0}
                max={50}
                step={1}
                inputMode="numeric"
                value={slippagePercent}
                onChange={(e) => setSlippagePercent(Math.max(0, Math.min(50, Number(e.target.value||1))))}
                className="w-16 rounded-md bg-black/30 border border-white/10 text-right appearance-none text-xs px-2 py-1"
              />
              <div className="text-xs text-white/40">%</div>
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
                const slippageBps = Math.round(slippagePercent * 100);
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

          <Button
            onClick={onSwap}
            className={`w-full rounded-full bg-brand-yellow text-brand-black font-semibold shadow-[0_3px_18px_rgba(246,210,58,0.35)] hover:brightness-110 active:scale-[0.98] transition ${busy ? 'pointer-events-none' : ''}`}
          >
            {busy ? 'Swapping…' : 'Swap'}
          </Button>

          {message && (
            <div className="text-green-400 text-sm break-all">
              <a className="underline" href={`https://solscan.io/tx/${message}`} target="_blank" rel="noreferrer">{message}</a>
            </div>
          )}
          {error && <div className="text-red-400 text-sm break-all">{error}</div>}
        </div>
        {/* Hide number input arrows globally for a cleaner slippage field */}
        <style jsx global>{`
          /* Chrome, Safari, Edge, Opera */
          input[type=number]::-webkit-outer-spin-button,
          input[type=number]::-webkit-inner-spin-button {
            -webkit-appearance: none;
            margin: 0;
          }
          /* Firefox */
          input[type=number] {
            -moz-appearance: textfield;
          }
        `}</style>
      </div>
    </div>
  );
}
