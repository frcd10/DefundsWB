'use client';

import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { VersionedTransaction } from '@solana/web3.js';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { solanaFundServiceModular as solanaFundService } from '@/services/solanaFund';

interface WithdrawFromFundModalProps {
  isOpen: boolean;
  onClose: () => void;
  fundId: string;
  fundName: string;
  userShares: number;
  totalShares: number;
  sharePercentage: number;
  currentValue: number;
  onWithdrawComplete?: (signature: string) => void;
}

export function WithdrawFromFundModal({ 
  isOpen, 
  onClose, 
  fundId, 
  fundName,
  userShares,
  totalShares,
  sharePercentage,
  currentValue,
  onWithdrawComplete 
}: WithdrawFromFundModalProps) {
  const wallet = useWallet();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [withdrawPercentage, setWithdrawPercentage] = useState('100');
  const [submitted, setSubmitted] = useState(false);
  const [customPct, setCustomPct] = useState('');

  // Withdrawals enabled (remove cluster gating)
  const withdrawalsEnabled = true;

  const pct = parseFloat(withdrawPercentage || '0');
  const withdrawAmount = (currentValue * (isFinite(pct) ? pct : 0)) / 100;
  const fmt4 = (n: number) => (isFinite(n) ? n.toFixed(4) : '0.0000');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Withdrawals are enabled
    
    console.log('=== WITHDRAWAL ATTEMPT ===');
    console.log('Fund ID:', fundId);
    console.log('Fund Name:', fundName);
    console.log('Withdraw Percentage:', withdrawPercentage, '%');
    console.log('Withdraw Amount:', withdrawAmount, 'SOL');
    console.log('User Shares:', userShares, '/', totalShares);
    console.log('Wallet connected:', !!wallet.connected);
    console.log('Wallet public key:', wallet.publicKey?.toString());

    if (!wallet.connected || !wallet.publicKey) {
      setError('Please connect your wallet');
      return;
    }

    const withdrawPct = parseFloat(withdrawPercentage);
    if (isNaN(withdrawPct) || withdrawPct <= 0 || withdrawPct > 100) {
      setError('Please enter a valid withdrawal percentage (1-100)');
      return;
    }

    setIsLoading(true);
  if (submitted) return; // guard double submit
  setSubmitted(true);
    setError(null);

    try {
      console.log('Starting withdrawal process...');
      const b64ToBytes = (b64: string) => {
        if (typeof atob === 'function') {
          const bin = atob(b64); const ui8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) ui8[i] = bin.charCodeAt(i); return ui8;
        } else { const buf = Buffer.from(b64, 'base64'); return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) }
      };
      const bytesToB64 = (bytes: Uint8Array) => {
        if (typeof btoa !== 'function') { throw new Error('Base64 encoding not available'); }
        let binary = ''; for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]); return btoa(binary);
      };

      const sendUnsignedTx = async (txBase64: string) => {
        if (!wallet.signTransaction) throw new Error('Wallet does not support signing');
        const bytes = b64ToBytes(txBase64);
        const tx = VersionedTransaction.deserialize(bytes);
        const signed = (await wallet.signTransaction(tx)) as VersionedTransaction;
        const rawB64 = bytesToB64(signed.serialize());
        const rpcRes = await fetch('/api/rpc/send', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ txBase64: rawB64, options: { skipPreflight: true, preflightCommitment: 'processed' } }) });
        const body = await rpcRes.json().catch(() => ({} as any));
        if (!rpcRes.ok || body?.error || body?.ok === false) throw new Error(body?.error?.message || body?.error || `RPC send failed (${rpcRes.status})`);
        const sig: string = body?.signature || body?.result || body?.txid;
        if (!sig) throw new Error('RPC send did not return a signature');
        return sig;
      };

      const investor = wallet.publicKey.toBase58();
      const perMintSigs: string[] = [];

      // 1) Initiate
      const startRes = await fetch('/api/withdraw/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ investor, fundId, percentRequested: withdrawPct }) });
      const startData = await startRes.json();
      if (!startRes.ok || startData?.success === false) throw new Error(startData?.error || 'Withdraw start failed');
      const initSig = await sendUnsignedTx(startData.data.txBase64);
      console.log('initiate signature', initSig);

      // 2) Plan swaps (first pass)
      const plan = async (opts?: { onlyDirectRoutes?: boolean; excludeDexes?: string }) => {
        const res = await fetch('/api/withdraw/plan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ investor, fundId, ...(opts || {}) }) });
        const json = await res.json();
        if (!res.ok || json?.success === false) throw new Error(json?.error || 'Plan failed');
        return json.data.items as Array<{ txBase64: string }>;
      };

      let items = await plan();
      // 2a) Execute plan items, retry strategy if specific errors arise
      const failed: Array<{ idx: number; err: string }> = [];
      for (let i = 0; i < items.length; i++) {
        try {
          const sig = await sendUnsignedTx(items[i].txBase64);
          perMintSigs.push(sig);
        } catch (e: any) {
          const msg = String(e?.message || e);
          failed.push({ idx: i, err: msg });
        }
      }
      if (failed.length) {
        const needDirect = failed.some(f => /encoding overruns|Transaction too large|account keys|too large/i.test(f.err));
        const needExcludeSimple = failed.some(f => /from must not carry data/i.test(f.err));
        if (needDirect || needExcludeSimple) {
          items = await plan({ onlyDirectRoutes: needDirect, excludeDexes: needExcludeSimple ? 'Simple' : undefined });
          // try all again; in a more granular flow we could skip those already sent, but txs depend on state so rerun all is safer
          perMintSigs.length = 0; // reset to reflect the successful batch
          for (let i = 0; i < items.length; i++) {
            const sig = await sendUnsignedTx(items[i].txBase64);
            perMintSigs.push(sig);
          }
        } else {
          throw new Error(failed[0].err || 'Swap execution failed');
        }
      }

      // 3) Unwrap
      const unwrapRes = await fetch('/api/withdraw/unwrap', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ investor, fundId }) });
      const unwrapJson = await unwrapRes.json();
      if (!unwrapRes.ok || unwrapJson?.success === false) throw new Error(unwrapJson?.error || 'Unwrap failed');
      const unwrapSig = await sendUnsignedTx(unwrapJson.data.txBase64);
      console.log('unwrap signature', unwrapSig);

      // 4) Finalize
      const finRes = await fetch('/api/withdraw/finalize', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ investor, fundId }) });
      const finJson = await finRes.json();
      if (!finRes.ok || finJson?.success === false) throw new Error(finJson?.error || 'Finalize failed');
      const finalizeSig = await sendUnsignedTx(finJson.data.txBase64);
      console.log('finalize signature', finalizeSig);

      // 5) Derive payout lamports from finalize tx meta via RPC proxy
      let amountSol = 0;
      try {
        const rpc = await fetch('/api/rpc', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTransaction', params: [finalizeSig, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 }] }) });
        const payload = await rpc.json();
        const tx = payload?.result;
        const meta = tx?.meta;
  const pre = meta?.preBalances as number[] | undefined;
  const post = meta?.postBalances as number[] | undefined;
        const keys: string[] = (tx?.transaction?.message?.staticAccountKeys as string[]) || (tx?.transaction?.message?.accountKeys as string[]) || [];
        const idx = Array.isArray(keys) ? keys.findIndex(k => k === investor) : -1;
        if (idx >= 0 && pre && post) {
          const deltaNum = (post[idx] || 0) - (pre[idx] || 0);
          if (deltaNum > 0) amountSol = deltaNum / 1e9;
        }
      } catch {}

      // 6) Persist record
      try {
        await fetch('/api/withdraw/record', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ investor, fundId, amountSol, signature: finalizeSig, details: { perMintSwapSigs: perMintSigs, percentRequested: withdrawPct } })
        })
      } catch {}

      onWithdrawComplete?.(finalizeSig);
    } catch (error) {
      console.error('=== ERROR WITHDRAWING FROM FUND ===');
      console.error('Error details:', error);
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      
      setError(error instanceof Error ? error.message : 'Failed to withdraw from fund');
    } finally {
      setIsLoading(false);
      setSubmitted(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[520px] bg-[#0B0B0C] text-white border border-white/10 rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_8px_40px_-4px_rgba(0,0,0,0.65)] p-0 overflow-hidden">
        <div className="h-1 w-full bg-gradient-to-r from-brand-yellow via-brand-yellow/60 to-transparent" />
        <div className="px-6 pt-6 pb-2">
          <DialogHeader>
            <DialogTitle className="text-2xl font-extrabold text-white">
              Withdraw from {fundName}
            </DialogTitle>
            <DialogDescription className="text-white/70">
              Withdraw a percentage of your position.
            </DialogDescription>
          </DialogHeader>
        </div>

        {error && (
          <div className="mx-6 mt-2 mb-4 p-3 bg-red-900/30 border border-red-700 rounded-md text-sm text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5 px-6 pb-7">
          <div className="bg-white/5 p-4 rounded-xl border border-white/10">
            <h4 className="text-sm font-medium text-white mb-2">Your Position</h4>
            <div className="space-y-1 text-xs text-white/70">
              <div className="flex justify-between">
                <span>Your Shares:</span>
                <span>{userShares.toFixed(2)} / {totalShares.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Ownership:</span>
                <span>{sharePercentage.toFixed(2)}%</span>
              </div>
              <div className="flex justify-between">
                <span>Current Value:</span>
                <span>{fmt4(currentValue)} SOL</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-white/70">Withdrawal Percentage</label>
            <div className="grid grid-cols-5 gap-2 mb-2">
              {[100, 50, 25, 10].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setWithdrawPercentage(String(p))}
                  className={`h-10 rounded-lg text-sm font-semibold border transition ${withdrawPercentage === String(p) ? 'bg-brand-yellow text-brand-black border-brand-yellow' : 'bg-white/5 text-white/80 border-white/15 hover:bg-white/10'}`}
                >
                  {p}%
                </button>
              ))}
              <div className="relative">
                <Input
                  type="number"
                  value={customPct}
                  onChange={(e) => {
                    setCustomPct(e.target.value);
                    const v = Math.max(0, Math.min(100, Number(e.target.value || '0')));
                    if (!Number.isNaN(v)) setWithdrawPercentage(String(v));
                  }}
                  placeholder="Custom"
                  min="1"
                  max="100"
                  step="0.01"
                  className="h-10 rounded-lg bg-white/5 border border-white/15 focus:border-brand-yellow/60 focus:ring-0 text-sm placeholder-white/30 text-white pr-14"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 text-xs">%</span>
              </div>
            </div>
            <p className="text-xs text-white/60">Choose 100/50/25/10% or type a custom percentage.</p>
          </div>

          <div className="bg-white/5 p-4 rounded-xl border border-white/10">
            <h4 className="text-sm font-medium text-white mb-2">Withdrawal Details</h4>
            <p className="text-xs text-white/70 mb-3">Choose the amount you want to withdraw — All your positions will be closed and you will receive SOL in your wallet.</p>
            <div className="space-y-1 text-xs text-white/70">
              <div className="flex justify-between">
                <span>Withdraw:</span>
                <span>{withdrawPercentage}% of your position</span>
              </div>
              <div className="flex justify-between">
                <span>Amount:</span>
                <span className="text-brand-yellow font-semibold">{fmt4(withdrawAmount)} SOL</span>
              </div>
              <div className="flex justify-between">
                <span>Remaining:</span>
                <span>{fmt4(((100 - (isFinite(pct) ? pct : 0)) * currentValue) / 100)} SOL</span>
              </div>
            </div>
            <div className="mt-3 p-2 bg-white/5 border border-white/10 rounded">
              <p className="text-xs text-white/60">
                You need at least 0.01 SOL in your wallet to pay fees and create accounts — Accounts created will be closed and refunded at the end of withdraw.
              </p>
              <p className="text-[11px] text-red-400 mt-1">
                ILLIQUID POSITIONS OR POSITIONS UNDER 0.1 USDC VALUE WILL BE CONSIDERED AS ZERO VALUE AND YOUR OWNERSHIP OF FUND WILL BE BURN.
              </p>
            </div>
            {/* Withdrawals notice removed (always enabled) */}
          </div>

          <div className="flex gap-4 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 inline-flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/15 text-sm font-medium h-11 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 inline-flex items-center justify-center rounded-full bg-brand-yellow text-brand-black font-semibold h-11 shadow-[0_3px_18px_rgba(246,210,58,0.35)] hover:brightness-110 active:scale-[0.97] transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Withdrawing...' : 'Withdraw SOL'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
