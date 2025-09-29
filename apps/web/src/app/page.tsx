/* ──────────────────────────────────────────────────────────────────────
   src/app/page.tsx – Landing / Introduction page
   ------------------------------------------------------------------ */
"use client";

// Landing page adjusted to institutional palette; waitlist functionality removed.

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useLandingMetrics } from '../hooks/useLandingMetrics';
// Background now uses an MP4 video for better compression than animated GIF.
// If you want a static fallback, add a poster image.
// (No Next/Image required for raw video.)


/* Simple counter hook for animated metrics */
function useCountUp(end: number, duration = 1400, startOnVisible = true) {
  const [value, setValue] = useState(0);
  const ref = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (!startOnVisible) return;
    let started = false;
    const node = ref.current;
    if (!node) return;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !started) {
          started = true;
          const start = performance.now();
          const step = (t: number) => {
            const p = Math.min(1, (t - start) / duration);
            setValue(Math.round(end * p));
            if (p < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }
      });
    }, { threshold: 0.25 });
    obs.observe(node);
    return () => obs.disconnect();
  }, [end, duration, startOnVisible]);
  return { ref, value };
}

function Metric({ label, value, suffix = '+', decimals = 0 }: { label: string; value: number; suffix?: string; decimals?: number }) {
  const { ref, value: v } = useCountUp(value);
  const display = decimals > 0 ? (v / Math.pow(10, decimals)).toFixed(decimals) : v;
  return (
    <div className="flex flex-col items-center text-center">
      <span ref={ref} className="font-semibold tabular-nums text-xl sm:text-2xl text-brand-yellow tracking-tight">{display}<span className="text-white/60 text-base align-top">{suffix}</span></span>
      <span className="text-[11px] uppercase tracking-wider text-white/50 mt-1">{label}</span>
    </div>
  );
}

export default function Landing() {
  const { loading, activeFunds, activeRwa, totalInvestors, totalTvl } = useLandingMetrics();

  return (
    <>
      {/* Hero section */}
      <section
        className="relative flex min-h-screen flex-col items-center justify-start pt-20 sm:pt-24 pb-16 px-4 sm:px-6 text-center text-white overflow-hidden bg-brand-black"
      >
        {/* Background video layer */}
        <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          <video
            className="w-full h-full object-cover object-center opacity-40"
            autoPlay
            muted
            playsInline
            loop
            preload="auto"
            aria-hidden="true"
          >
            <source src="/media/Bcmp4.mp4" type="video/mp4" />
          </video>
          {/* Overlays for readability */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(0,0,0,0)_0%,rgba(0,0,0,0.35)_80%)]" />
        </div>
        {/* Content wrapper above background */}
        <div className="relative z-10 flex flex-col items-center w-full">
        {/* Trust / indicator bar */}
        <div className="mb-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[11px] tracking-wider uppercase text-white/50">
          <span className="flex items-center gap-1">Audited <span className="text-white/30">(EST Q1 2026)</span></span>
          <span className="hidden sm:inline-block w-px h-3 bg-white/15" />
          <span className="flex items-center gap-1">Built on <span className="text-brand-yellow">Solana</span></span>
          <span className="hidden sm:inline-block w-px h-3 bg-white/15" />
          <span className="flex items-center gap-1">Open Source</span>
        </div>

        <h1 className="mb-5 text-3xl sm:text-4xl lg:text-5xl font-extrabold leading-[1.1] tracking-tight max-w-4xl">
          Institutional-Grade On‑Chain Asset Management
        </h1>
        <p className="mb-8 sm:mb-10 max-w-2xl text-sm sm:text-base md:text-lg text-white/70 leading-relaxed">
          Launch or allocate into professionally structured on-chain funds – and extend strategies into
          <span className="text-brand-yellow"> real‑world assets (RWA)</span>. Maintain full custody while accessing audited
          infrastructure, transparent fee mechanics and real-time program level NAV.
        </p>

        {/* Metrics (dynamic) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-10 mb-10 w-full max-w-4xl">
          <Metric label="ACTIVE FUNDS" value={loading ? 0 : activeFunds} />
          <Metric label="ACTIVE RWA" value={loading ? 0 : activeRwa} />
          {/* Scale TVL by decimals factor so animation counts integer steps; then format */}
          <Metric label="TOTAL TVL (SOL)" value={loading ? 0 : Math.round(totalTvl * 100)} suffix="" decimals={2} />
          <Metric label="TOTAL INVESTORS" value={loading ? 0 : totalInvestors} />
        </div>

        {/* Primary CTAs */}
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <Link
            href="/Funds"
            className="group inline-flex items-center justify-center rounded-full bg-brand-yellow px-8 py-4 text-base font-semibold text-brand-black shadow-[0_4px_14px_rgba(246,210,58,0.35)] hover:brightness-110 hover:shadow-[0_6px_22px_rgba(246,210,58,0.45)] active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-brand-yellow/50 transition min-w-[220px]"
          >
            Explore Funds
          </Link>
          <Link
            href="/rwa"
            className="inline-flex items-center justify-center rounded-full border border-brand-yellow/70 px-8 py-4 text-base font-semibold text-brand-yellow hover:bg-brand-yellow hover:text-brand-black active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-brand-yellow/40 transition min-w-[220px]"
          >
            Explore RWA
          </Link>
        </div>
  {/* Removed divider line per request */}
  {/* safelist: bg-brand-yellow text-brand-black */}
        </div>
      </section>

      {/* RWA Bridge Section */}
      <section className="relative bg-brand-black py-20 px-4 sm:px-6 text-white border-t border-white/5">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-14 items-start">
            <div>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-5">Where On‑Chain Meets Off‑Chain</h2>
              <p className="text-white/70 leading-relaxed text-sm sm:text-base mb-6 max-w-prose">
                Our Real‑World Assets framework lets managers originate, tokenize and service off‑chain exposures (invoices,
                yield agreements, structured credit) while preserving on‑chain transparency, deterministic fee accrual and
                continuous liquidity windows. Capital flows are program governed; redemption logic enforces seniority and
                distribution priority without custodial middle layers.
              </p>
              <ul className="space-y-3 text-white/70 text-sm sm:text-[15px] mb-8">
                <li className="flex gap-3"><span className="text-brand-yellow">•</span><span>Tokenized claim structure with verifiable cashflow attestations.</span></li>
                <li className="flex gap-3"><span className="text-brand-yellow">•</span><span>Isolated vault architecture – RWA risk segmented from liquid trading sleeves.</span></li>
                <li className="flex gap-3"><span className="text-brand-yellow">•</span><span>Programmable performance & servicing fees – no manual reconciliations.</span></li>
                <li className="flex gap-3"><span className="text-brand-yellow">•</span><span>Lifecycle events (funding, coupon, maturity) emitted as on‑chain state transitions.</span></li>
              </ul>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  href="/rwa"
                  className="inline-flex items-center justify-center rounded-full bg-brand-yellow px-7 py-3 text-sm font-semibold text-brand-black hover:brightness-110 active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-brand-yellow/40 transition shadow-[0_3px_12px_rgba(246,210,58,0.25)]"
                >
                  Explore RWA Framework
                </Link>
                <Link
                  href="/contact"
                  className="inline-flex items-center justify-center rounded-full border border-white/20 px-7 py-3 text-sm font-medium text-white/70 hover:text-white hover:border-white/40 active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-white/20 transition"
                >
                  Talk to Team
                </Link>
              </div>
            </div>
            <div className="space-y-6">
              <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6">
                <h3 className="text-sm font-semibold text-brand-yellow mb-2 tracking-wide">RWA VAULT LAYERS</h3>
                <p className="text-xs text-white/60 leading-relaxed">Segregated accounting domains isolate off‑chain collateral from on‑chain liquid portfolios. Each vault exposes deterministic NAV surfaces & withdrawal curves.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6">
                <h3 className="text-sm font-semibold text-brand-yellow mb-2 tracking-wide">DATA ATTESTATION</h3>
                <p className="text-xs text-white/60 leading-relaxed">Signed oracle proofs anchor servicing events (interest, principal, impairment) enabling verifiable yield derivation and risk scoring.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6">
                <h3 className="text-sm font-semibold text-brand-yellow mb-2 tracking-wide">PROGRAMMED CASHFLOWS</h3>
                <p className="text-xs text-white/60 leading-relaxed">Fees & waterfall distributions computed on-chain; eliminates manual spreadsheets and reconciliation risk.</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
