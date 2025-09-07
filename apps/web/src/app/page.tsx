/* ──────────────────────────────────────────────────────────────────────
   src/app/page.tsx – Landing / Introduction page
   ------------------------------------------------------------------ */
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import WaitlistModal from '@/components/WaitlistModal';

export default function Landing() {
  const [openFor, setOpenFor] = useState<'trader' | 'investor' | null>(null);

  return (
    <>
      {/* Hero section */}
      <section
        className="flex min-h-screen flex-col items-center justify-center
                   bg-gradient-to-b from-sol-900 via-sol-850 to-sol-800
                   px-4 sm:px-6 text-center text-white"
      >
        {/* Top title: bigger & spaced ↓ */}
        <h1 className="mb-6 sm:mb-10 text-3xl sm:text-5xl lg:text-7xl font-extrabold leading-tight">
          The <span className="text-sol-accent">Future</span> of Hedge Funds
        </h1>

        <h2 className="mb-6 max-w-3xl text-2xl sm:text-4xl lg:text-6xl font-extrabold leading-tight">
          Self-Custodial<br />
          <span className="text-sol-accent">No Intermediaries</span><br />
          <span className="text-sol-light">Open Source</span><br />
          <span className="text-sol-accent">Invest &amp; Withdraw&nbsp;24/7</span>
        </h2>

        <p className="mb-8 sm:mb-12 max-w-xl text-base sm:text-lg opacity-90 px-2">
          On-chain asset management that keeps you in control. Delegate capital
          to top traders or launch your own fund — all secured by Solana smart
          contracts and audited open-source code.
        </p>

        {/* Call-to-action buttons */}
        <div className="flex flex-col gap-4 sm:flex-row w-full max-w-md sm:max-w-none justify-center items-center">
          <Button
            size="lg"
            className="w-full sm:w-56 rounded-xl bg-gradient-to-r from-sol-accent to-cyan-400
                       px-6 py-3 sm:py-2 font-semibold text-sol-900 shadow-md
                       transition hover:scale-105 text-sm sm:text-base"
            onClick={() => setOpenFor('investor')}
          >
            Join Investor Waitlist
          </Button>

          <Button
            size="lg"
            className="w-full sm:w-56 rounded-xl bg-gradient-to-r from-sol-accent to-cyan-400
                       px-6 py-3 sm:py-2 font-semibold text-sol-900 shadow-md
                       transition hover:scale-105 text-sm sm:text-base"
            onClick={() => setOpenFor('trader')}
          >
            Join Traders/RWA Ops Waitlist
          </Button>
        </div>
      </section>

      {/* Waitlist modal (shared) */}
      {openFor && (
        <WaitlistModal forRole={openFor} onClose={() => setOpenFor(null)} />
      )}
    </>
  );
}
