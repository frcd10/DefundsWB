/* ──────────────────────────────────────────────────────────────────────
   src/app/page.tsx – Landing / Introduction page
   ------------------------------------------------------------------ */
"use client";

// Landing page adjusted to institutional palette; waitlist functionality removed.

import Link from 'next/link';
// Background now uses an MP4 video for better compression than animated GIF.
// If you want a static fallback, add a poster image.
// (No Next/Image required for raw video.)


export default function Landing() {

  return (
    <>
      {/* Hero section */}
      <section
        className="relative flex min-h-screen flex-col items-center justify-start pt-28 sm:pt-32 px-4 sm:px-6 text-center text-white overflow-hidden bg-brand-black"
      >
        {/* Background video layer */}
        <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          <video
            className="w-full h-full object-cover object-center opacity-55"
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
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_40%_35%,rgba(0,0,0,0)_0%,rgba(0,0,0,0.28)_75%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0)_55%,rgba(0,0,0,0.55))]" />
        </div>
        {/* Content wrapper above background */}
        <div className="relative z-10 flex flex-col items-center w-full">
        {/* Top title */}
        <h1 className="mb-6 sm:mb-10 text-3xl sm:text-5xl lg:text-7xl font-extrabold leading-tight">
          The <span className="text-brand-yellow">Future</span> of Hedge Funds
        </h1>

        <h2 className="mb-6 max-w-3xl text-2xl sm:text-4xl lg:text-6xl font-extrabold leading-tight">
          Self-Custodial<br />
          <span className="text-brand-yellow">No Intermediaries</span><br />
          <span className="text-white/70">Open Source</span><br />
          <span className="text-brand-yellow">Invest &amp; Withdraw&nbsp;24/7</span>
        </h2>

        <p className="mb-8 sm:mb-12 max-w-xl text-base sm:text-lg opacity-90 px-2">
          On-chain asset management that keeps you in control. Delegate capital
          to top traders or launch your own fund — all secured by Solana smart
          contracts and audited open-source code.
        </p>

    {/* Primary CTAs */}
  <div className="mt-4 flex flex-col sm:flex-row items-center gap-4">
          <Link
            href="/Funds"
            className="cta-primary inline-flex items-center justify-center rounded-full bg-brand-yellow px-8 py-4 text-base font-semibold text-brand-black hover:brightness-110 transition min-w-[220px]"
          >
            Explore Funds
          </Link>
          <Link
            href="/rwa"
            className="cta-primary inline-flex items-center justify-center rounded-full bg-brand-yellow px-8 py-4 text-base font-semibold text-brand-black hover:brightness-110 transition min-w-[220px]"
          >
            Explore RWA
          </Link>
        </div>
  {/* safelist: bg-brand-yellow text-brand-black */}
        </div>
      </section>
    </>
  );
}
