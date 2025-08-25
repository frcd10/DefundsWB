'use client';

import { TrendingUp, Clock3, Zap, ArrowRight } from 'lucide-react';

export default function Products() {
  return (
    <main className="min-h-screen bg-sol-900 text-sol-50 pb-24">
      <section className="max-w-6xl mx-auto px-4 pt-28">
        {/* -------------------------------------------------- Hero */}
        <h1 className="text-5xl font-extrabold mb-4 drop-shadow-lg">
          Funds&nbsp;Marketplace
        </h1>
        <p className="text-lg text-sol-200 max-w-2xl">
          For a century, <span className="font-semibold">hedge funds</span> have helped the
          wealthy beat benchmarks year after year. Today—thanks to Solana—you can tap the same
          alpha&nbsp;<em>without brokers, banks, or lock-ups</em>.  
          Welcome to Hedge&nbsp;on&nbsp;Web3.
        </p>

        {/* -------------------------------------------------- 3-step banner */}
        <div className="mt-16 grid md:grid-cols-3 gap-8">
          <Step
            icon={<TrendingUp className="w-7 h-7 text-sol-accent" />}
            title="Pick a fund"
            body="Browse trader stats, risk, and historical NAV. Choose the strategy that fits you."
          />
          <Step
            icon={<Zap className="w-7 h-7 text-sol-accent" />}
            title="Delegate capital"
            body="Deposit any amount. Your tokens mint instant vault shares—no middle-man custody."
          />
          <Step
            icon={<Clock3 className="w-7 h-7 text-sol-accent" />}
            title="Withdraw 24 / 7"
            body="Click Exit, choose % of shares, receive SOL seconds later. No quarterly gates."
          />
        </div>

        {/* -------------------------------------------------- Value props */}
        <h2 className="text-3xl font-bold mt-24 mb-8">Why trade the Web3 way?</h2>
        <ul className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            ['Decades of alpha', 'Some managers still beat benchmarks after 30 + years. Now you can access them permissionlessly.'],
            ['No intermediaries', 'Funds live on-chain; your wallet talks to code—not humans.'],
            ['Real-time NAV', 'Every trade settles on Solana; portfolio value updates second-by-second.'],
            ['Any size, any time', 'Deploy 0.1 SOL or 1 000 SOL—up to you. Zero minimum tenure.'],
            ['Flat transparent fees', 'Performance & management fees encoded in the program, visible to everyone.'],
            ['Privacy Protected', 'You only need your wallet to invest.'],
          ].map(([t, b]) => (
            <li key={t} className="bg-sol-800/60 rounded-2xl p-5">
              <h3 className="font-semibold mb-1 text-sol-accent">{t}</h3>
              <p className="text-sol-200 text-sm leading-relaxed">{b}</p>
            </li>
          ))}
        </ul>

        {/* -------------------------------------------------- CTA */}
        <div className="mt-20 text-center">
          <a
            href="/#get"
            className="inline-flex items-center gap-2 rounded-xl bg-sol-accent text-sol-900 font-semibold px-8 py-3 shadow-lg hover:scale-105 transition"
          >
            Explore funds <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </section>
    </main>
  );
}

/* Reusable card */
function Step({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <article className="bg-sol-800/60 rounded-2xl p-6 flex flex-col gap-4">
      <header className="flex items-center gap-3">
        {icon}
        <h2 className="text-xl font-semibold">{title}</h2>
      </header>
      <p className="text-sol-200 text-sm">{body}</p>
    </article>
  );
}
