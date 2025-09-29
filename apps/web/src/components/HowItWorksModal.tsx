"use client";
import React, { useEffect } from "react";

interface HowItWorksModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/* Lightweight modal patterned after other modals in repo */
export function HowItWorksModal({ isOpen, onClose }: HowItWorksModalProps) {
  useEffect(() => {
    if (isOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-3xl rounded-2xl bg-brand-surface/90 border border-white/10 shadow-xl backdrop-blur-xl p-6 sm:p-10 overflow-y-auto max-h-[85vh]">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 text-white/60 hover:text-white text-sm"
        >
          ✕
        </button>
        <header className="mb-6">
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">How It Works</h2>
          <p className="text-white/60 mt-2 text-sm max-w-prose">A quick primer on using on-chain managed funds.</p>
        </header>
        <div className="prose prose-invert max-w-none text-sm leading-relaxed">
          <ol className="list-decimal pl-5 space-y-3 marker:text-brand-yellow">
            <li><strong>Connect Wallet:</strong> Use the yellow wallet button in the navbar to connect Phantom or another supported wallet.</li>
            <li><strong>Explore Funds:</strong> Browse performance, fee structure and stats. Expand rows for deeper metrics.</li>
            <li><strong>Deposit:</strong> Click Invest and approve the transaction. You receive program shares representing claim on the fund NAV.</li>
            <li><strong>Strategy Execution:</strong> Managers trade within program constraints; accounting updates on-chain keeping NAV transparent.</li>
            <li><strong>Withdraw Anytime:</strong> Redeem shares to receive SOL (minus any crystallized performance/management fees) instantly.</li>
            <li><strong>Security & Custody:</strong> Assets live in the Solana program vault; managers get execution authority, not withdrawal rights.</li>
          </ol>
          <div className="mt-8 grid sm:grid-cols-2 gap-5">
            {[
              ['Transparent Fees', 'All fees enforced by audited open-source code; no hidden carry or admin layers.'],
              ['Real-Time NAV', 'Portfolio valuation updates after every on-chain trade; no quarterly statements.'],
              ['Self-Custodial', 'You always hold redeemable shares. Exit liquidity is permissionless.'],
              ['Aligned Incentives', 'Performance fees accrue only on net new highs (high-water mark paradigm).'],
            ].map(([t,b]) => (
              <div key={t} className="rounded-xl bg-white/5 border border-white/10 p-4">
                <h4 className="font-semibold mb-1 text-brand-yellow text-sm">{t}</h4>
                <p className="text-[13px] text-white/70 leading-snug">{b}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 p-4 rounded-xl bg-gradient-to-r from-brand-yellow/10 to-transparent border border-brand-yellow/20 text-white/80 text-[13px]">
            This interface is experimental. Always verify fund addresses and exercise caution—smart contract risk and market risk apply.
          </div>
        </div>
        <footer className="mt-8 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-full border border-white/20 px-5 py-2 text-xs font-medium text-white/70 hover:text-white hover:bg-white/10 transition"
          >Close</button>
        </footer>
      </div>
    </div>
  );
}
