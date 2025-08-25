'use client';

import { ArrowRight, Lock, Wallet, GitBranch } from 'lucide-react';

export default function HowItWorks() {
  return (
    <main className="min-h-screen bg-sol-900 text-sol-50 pb-24">
      <section className="max-w-6xl mx-auto px-4 pt-28">
        <h1 className="text-5xl font-extrabold mb-4 drop-shadow-lg">
          How&nbsp;It&nbsp;Works
        </h1>
        <p className="text-lg text-sol-200 max-w-2xl">
          On&nbsp;Hedge&nbsp;on&nbsp;Web3, every vault is an <span className="text-sol-accent font-semibold">on-chain program</span>—no
          intermediaries, no custodians. Your keys stay in your wallet, period.
        </p>

        {/* ═════════════════════════════════════════════════════════════ */}
        {/*   1 · Vault Creation                                         */}
        {/* ═════════════════════════════════════════════════════════════ */}
        <div className="mt-16 grid lg:grid-cols-3 gap-8">
          <article className="bg-sol-800/60 rounded-2xl p-6 flex flex-col gap-4">
            <header className="flex items-center gap-3">
              <Lock className="w-7 h-7 text-sol-accent" />
              <h2 className="text-xl font-semibold">1. Vault is born 🔒</h2>
            </header>
            <p>
              A trader deploys a <span className="font-semibold">Vault Program</span> (open-source,
              auditable). The <strong>private&nbsp;key self-destructs</strong> at creation—nobody
              can ever recover it.
            </p>
            <div className="border-l-4 border-sol-accent pl-4 text-sm text-sol-200">
              Initial capital&nbsp;≥&nbsp;10&nbsp;SOL&nbsp;🍀
            </div>
          </article>

          {/* ─────────────── 2  ─────────────── */}
          <article className="bg-sol-800/60 rounded-2xl p-6 flex flex-col gap-4">
            <header className="flex items-center gap-3">
              <Wallet className="w-7 h-7 text-sol-accent" />
              <h2 className="text-xl font-semibold">2. Trading phase 💹</h2>
            </header>
            <p>
              Trader’s <span className="font-semibold">personal wallet has buy/sell privellege to trade</span>{' '}
            but&nbsp;<span className="text-red-400 font-semibold">cannot&nbsp;withdraw</span>.
            </p>
            <p className="text-sm text-sol-200">
              • Any token on Raydium, Orca, Meteora<br />
              • Advanced orders: limit, TWAP, arb, etc.
            </p>
          </article>

          {/* ─────────────── 3  ─────────────── */}
          <article className="bg-sol-800/60 rounded-2xl p-6 flex flex-col gap-4">
            <header className="flex items-center gap-3">
              <GitBranch className="w-7 h-7 text-sol-accent" />
              <h2 className="text-xl font-semibold">3. Fully decentralized 🌐</h2>
            </header>
            <p>
              No Web2 server needed. Interactions are direct{' '}
              <span className="font-semibold">RPC&nbsp;→&nbsp;Solana</span>. Front-end is a thin UI
              layer—you could even trade via CLI.
            </p>
            <p className="text-sm text-sol-200">
              Code&nbsp;→&nbsp;
              <a
                href="https://github.com/your-repo"
                target="_blank"
                className="underline text-sol-accent"
              >
                GitHub&nbsp;repo
              </a>
            </p>
          </article>
        </div>

        {/* ═════════════════════════════════════════════════════════════ */}
        {/*   Flow diagram                                               */}
        {/* ═════════════════════════════════════════════════════════════ */}
        <div className="relative mt-24">
          <div className="hidden md:block absolute inset-x-0 top-1/2 h-1 bg-sol-700" />
          <div className="grid md:grid-cols-3 gap-10 relative">

            {/* Trader deposits */}
            <Step
              title="Trader deposits 10 SOL+"
              desc="Locked as skin-in-the-game. Trader’s share rises & falls with users."
            />

            {/* Users join */}
            <Step
              title="Users contribute"
              desc="Invest any amount. Receive proportional vault shares."
            />

            {/* Exit / Withdraw */}
            <Step
              title="Withdraw anytime"
              desc="Click EXIT, choose % of your shares. The vault caps open positions, sends equivalent SOL."
            />
          </div>
        </div>

        {/* ═════════════════════════════════════════════════════════════ */}
        {/*   Benefits grid                                               */}
        {/* ═════════════════════════════════════════════════════════════ */}
        <h2 className="text-3xl font-bold mt-28 mb-8">Why it matters</h2>
        <ul className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            ['Self-custody', 'Only your wallet can withdraw.'],
            ['No lock-ups', 'Leave a fund in seconds—not quarterly.'],
            ['Transparent P/L', 'On-chain NAV, open positions, fees.'],
            ['Aligned incentives', 'Trader capital sits side-by-side with yours.'],
            ['Lower fees', 'No administrators, no middle-men take.</span>'],
            ['Not a Copy Trade', 'Completely differs from copy trade - You get exactly same trades from trader - Everyone is in the same boat'],
          ].map(([title, body]) => (
            <li key={title} className="bg-sol-800/60 rounded-2xl p-5">
              <h3 className="font-semibold mb-1 text-sol-accent">{title}</h3>
              <p className="text-sol-200 text-sm leading-relaxed">{body}</p>
            </li>
          ))}
        </ul>

        {/* CTA */}
        <div className="mt-20 text-center">
          <a
            href="/#get"
            className="inline-flex items-center gap-2 rounded-xl bg-sol-accent text-sol-900 font-semibold px-8 py-3 shadow-lg hover:scale-105 transition"
          >
            Get started now <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </section>
    </main>
  );
}

/* Helper component for the flow diagram */
function Step({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="bg-sol-800/60 rounded-2xl p-6 text-center relative">
      <h3 className="font-semibold text-sol-50 mb-2">{title}</h3>
      <p className="text-sm text-sol-200">{desc}</p>
    </div>
  );
}
