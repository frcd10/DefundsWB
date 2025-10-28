'use client';

import { useState } from 'react';
import Link from 'next/link';
import { TrendingUp, Users, Shield, Zap, DollarSign, Globe, Mail, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PitchDeckModal } from '@/components/PitchDeckModal';
import { JoinInvestorModal } from '@/components/JoinInvestorModal';

export default function InvestorPage() {
  const [openPitch, setOpenPitch] = useState(false);
  const [openJoin, setOpenJoin] = useState(false);

  return (
    <main className="min-h-screen bg-brand-black text-white pb-24">
      {/* Hero Section (Original Content) */}
      <section className="px-4 pt-20 sm:pt-32 pb-16 border-b border-white/5 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.08),transparent_60%)]">
        <div className="max-w-6xl mx-auto text-center">
          <h1 className="text-4xl sm:text-6xl font-semibold mb-6 leading-tight">
            Join the Future of
            <span className="text-brand-yellow block">Asset Management</span>
          </h1>
          <p className="text-lg sm:text-xl text-white/60 mb-8 max-w-3xl mx-auto leading-relaxed">
            Become a seed investor in the first fully decentralized hedge fund platform. We're
            redefining asset management with self-custodial vaults, transparent operations, and
            enforced on-chain protections.
          </p>

          {/* Valuation Banner */}
          <div className="mb-12 max-w-3xl mx-auto">
            <div className="rounded-2xl border border-brand-yellow/40 bg-brand-yellow/10 px-5 sm:px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-3 text-left sm:text-center">
              <div className="flex-1">
                <p className="text-sm sm:text-base leading-relaxed text-white/80">
                  <span className="text-brand-yellow font-semibold">We will run our 1st seed round after Hackaton!</span>. 
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full border border-brand-yellow/60 text-brand-yellow hover:bg-brand-yellow hover:text-brand-black px-5 py-2 text-xs font-semibold"
                onClick={() => setOpenJoin(true)}
              >
                Join Round
              </Button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-14">
            <Button
              size="lg"
              className="w-64 rounded-full bg-brand-yellow text-brand-black font-semibold px-8 py-3 text-lg shadow hover:brightness-110 transition"
              onClick={() => setOpenJoin(true)}
            >
              💎 Invest in Defunds
            </Button>
            <Button
              size="lg"
              variant="ghost"
              className="w-64 rounded-full bg-white/10 hover:bg-white/15 border border-white/10 text-white font-semibold px-8 py-3 text-lg transition"
              onClick={() => setOpenPitch(true)}
            >
              📊 View Pitch Deck
            </Button>
            <Link href="/roadmap" className="w-64">
              <Button
                size="lg"
                variant="ghost"
                className="w-full rounded-full bg-white/10 hover:bg-white/15 border border-white/10 text-white font-semibold px-8 py-3 text-lg transition"
              >
                🗺️ View Roadmap
              </Button>
            </Link>
          </div>

          <div className="grid md:grid-cols-3 gap-5 max-w-4xl mx-auto">
            <div className="rounded-2xl p-5 sm:p-6 bg-white/5 border border-white/10 backdrop-blur-sm">
              <DollarSign className="w-8 h-8 text-brand-yellow mb-3 mx-auto" />
              <h3 className="font-semibold text-lg mb-1">$50M+ Target AUM</h3>
              <p className="text-white/50 text-sm">First year projection</p>
            </div>
            <div className="rounded-2xl p-5 sm:p-6 bg-white/5 border border-white/10 backdrop-blur-sm">
              <Users className="w-8 h-8 text-brand-yellow mb-3 mx-auto" />
              <h3 className="font-semibold text-lg mb-1">10,000+ Users</h3>
              <p className="text-white/50 text-sm">Expected platform adoption</p>
            </div>
            <div className="rounded-2xl p-5 sm:p-6 bg-white/5 border border-white/10 backdrop-blur-sm">
              <Globe className="w-8 h-8 text-brand-yellow mb-3 mx-auto" />
              <h3 className="font-semibold text-lg mb-1">Global Market</h3>
              <p className="text-white/50 text-sm">$4.5T hedge fund industry</p>
            </div>
          </div>
        </div>
      </section>

      {/* Why Invest Section (Original) */}
      <section className="py-24 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-semibold text-center mb-16">
            Why Invest in <span className="text-brand-yellow">Defunds</span>?
          </h2>

          <div className="grid lg:grid-cols-2 gap-14">
            <div className="space-y-10">
              <InvestmentReason
                icon={<TrendingUp className="w-8 h-8 text-brand-yellow" />}
                title="Revolutionary Market Opportunity"
                description="First‑mover advantage in a $4.5T industry moving on‑chain. Legacy hedge funds are slow, opaque, and expensive. We're building the next operating system for asset management."
              />
              <InvestmentReason
                icon={<Shield className="w-8 h-8 text-brand-yellow" />}
                title="Self-Custodial Architecture"
                description="Smart contracts enforce all rules. Investors always control withdrawals while benefiting from professional execution—eliminating traditional counterparty risk."
              />
              <InvestmentReason
                icon={<Zap className="w-8 h-8 text-brand-yellow" />}
                title="Scalable & Transparent"
                description="Built on Solana for low latency & minimal fees. Open-source and modular: rapid deployment of new strategies with global accessibility."
              />
            </div>

            <div className="rounded-2xl p-8 bg-white/5 border border-white/10 backdrop-blur-sm">
              <h3 className="text-2xl font-semibold mb-6 text-center">Investment Highlights</h3>
              <ul className="space-y-4 text-sm">
                <li className="flex items-start gap-3">
                  <span className="text-brand-yellow font-semibold">•</span>
                  <span><strong>Proven Team:</strong> TradiFi market expertise + Web3 builders</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-brand-yellow font-semibold">•</span>
                  <span><strong>Technology:</strong> Full on chain + Open source</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-brand-yellow font-semibold">•</span>
                  <span><strong>Revenue Model:</strong> 1% Withdraw fee + 20% performance</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-brand-yellow font-semibold">•</span>
                  <span><strong>Early Stage Advantage:</strong> Pre‑launch valuation</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-brand-yellow font-semibold">•</span>
                  <span><strong>Token Economics:</strong> Governance + fee sharing</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-brand-yellow font-semibold">•</span>
                  <span><strong>Global Compliance:</strong> Built for institutional adoption</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Investment Tiers Section (Original) */}
      <section className="py-24 px-4 bg-white/5 border-y border-white/10">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-semibold text-center mb-16">
            Investment <span className="text-brand-yellow">Opportunities</span>
          </h2>
          {/* Valuation paragraph removed (now in hero banner) */}

          <div className="grid md:grid-cols-3 gap-8">
            <InvestmentTier
              tier="Angel"
              amount="$5K - $25K"
              features={[
                'Early investor status',
                'Increase position 25% in year one at same terms',
              ]}
              highlight={false}
            />
            <InvestmentTier
              tier="Strategic"
              amount="$25K - $150K"
              features={[
                'Product influence access',
                'Increase position 30% in year one at same terms',
              ]}
              highlight={true}
            />
            <InvestmentTier
              tier="Lead"
              amount="$150K+"
              features={[
                'Board seat / governance input',
                'Increase position 35% in year one at same terms',
              ]}
              highlight={false}
            />
          </div>
        </div>
      </section>

      {/* Contact Section (Original) */}
      <section className="py-24 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-semibold mb-8">
            Ready to <span className="text-brand-yellow">Invest</span>?
          </h2>
          <p className="text-xl text-white/60 mb-12 max-w-2xl mx-auto">
            Join visionary investors shaping the future of asset management. Limited allocation in
            the seed round.
          </p>

          <div className="flex flex-col sm:flex-row gap-6 justify-center mb-14">
            <Button
              size="lg"
              className="w-64 rounded-full bg-brand-yellow text-brand-black font-semibold px-8 py-3 text-lg shadow hover:brightness-110 transition"
              onClick={() => setOpenJoin(true)}
            >
              💰 Join as Investor
            </Button>
          </div>

          <div className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto">
            <div className="rounded-2xl p-6 flex items-center gap-4 bg-white/5 border border-white/10 backdrop-blur-sm">
              <Mail className="w-6 h-6 text-brand-yellow" />
              <div className="text-left">
                <h3 className="font-semibold">Email</h3>
                <p className="text-white/60 text-sm">contact@defunds.finance</p>
              </div>
            </div>
            <div className="rounded-2xl p-6 flex items-center gap-4 bg-white/5 border border-white/10 backdrop-blur-sm">
              <Send className="w-6 h-6 text-brand-yellow" />
              <div className="text-left">
                <h3 className="font-semibold">Telegram</h3>
                <p className="text-white/60 text-sm">@felipe_fel</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <PitchDeckModal open={openPitch} onClose={() => setOpenPitch(false)} />
      <JoinInvestorModal open={openJoin} onClose={() => setOpenJoin(false)} />
    </main>
  );
}

// Helper Components (Original retained ones)
function InvestmentReason({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0">{icon}</div>
      <div>
        <h3 className="text-lg font-semibold mb-1 text-brand-yellow">{title}</h3>
        <p className="text-white/60 leading-relaxed text-sm sm:text-base">{description}</p>
      </div>
    </div>
  );
}

function InvestmentTier({ tier, amount, features, highlight }: { tier: string; amount: string; features: string[]; highlight: boolean }) {
  return (
    <div
      className={`rounded-2xl p-8 relative overflow-hidden ${
        highlight
          ? 'bg-brand-yellow/10 border border-brand-yellow shadow-[0_0_0_1px_rgba(255,255,255,0.04)]'
          : 'bg-white/5 border border-white/10 backdrop-blur-sm'
      }`}
    >
      {highlight && (
        <div className="mb-5" aria-hidden />
      )}
      <h3 className="text-2xl font-semibold text-center mb-1">{tier}</h3>
      <p className="text-lg text-brand-yellow font-semibold text-center mb-6">{amount}</p>
      <ul className="space-y-3 text-sm">
        {features.map((feature, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="text-brand-yellow font-semibold">✓</span>
            <span className="text-white/60">{feature}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// (Removed institutional helper components)
