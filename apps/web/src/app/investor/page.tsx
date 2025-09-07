'use client';

import { useState } from 'react';
import { TrendingUp, Users, Shield, Zap, DollarSign, Globe, Mail, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import WaitlistModal from '@/components/WaitlistModal';

export default function InvestorPage() {
  const [openWaitlist, setOpenWaitlist] = useState(false);

  return (
    <main className="min-h-screen bg-sol-900 text-sol-50">
      {/* Hero Section */}
      <section className="relative bg-gradient-to-b from-sol-900 via-sol-850 to-sol-800 px-4 pt-16 sm:pt-28 pb-12 sm:pb-20">
        <div className="max-w-6xl mx-auto text-center">
          <h1 className="text-4xl sm:text-6xl font-extrabold mb-4 sm:mb-6 drop-shadow-lg">
            Join the Future of
            <span className="text-sol-accent block">Asset Management</span>
          </h1>
          <p className="text-lg sm:text-xl text-sol-200 mb-6 sm:mb-8 max-w-3xl mx-auto leading-relaxed">
            Become a seed investor in the world&apos;s first fully decentralized hedge fund platform. 
            We&apos;re revolutionizing asset management with self-custodial funds, transparent operations, 
            and unprecedented investor protection.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8 sm:mb-12">
            <Button
              size="lg"
              className="w-64 rounded-xl bg-gradient-to-r from-sol-accent to-cyan-400
                         px-8 py-3 font-semibold text-sol-900 shadow-lg text-lg
                         transition hover:scale-105"
              onClick={() => setOpenWaitlist(true)}
            >
              💎 Invest in Defunds
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="w-64 rounded-xl border-2 border-sol-accent text-sol-accent
                         px-8 py-3 font-semibold text-lg hover:bg-sol-accent hover:text-sol-900"
            >
              📊 View Pitch Deck
            </Button>
          </div>

          <div className="grid md:grid-cols-3 gap-4 sm:gap-6 max-w-4xl mx-auto">
            <div className="bg-sol-800/60 rounded-xl p-4 sm:p-6">
              <DollarSign className="w-8 h-8 text-sol-accent mb-3 mx-auto" />
              <h3 className="font-bold text-lg mb-2">$50M+ Target AUM</h3>
              <p className="text-sol-200 text-sm">First year projection</p>
            </div>
            <div className="bg-sol-800/60 rounded-xl p-4 sm:p-6">
              <Users className="w-8 h-8 text-sol-accent mb-3 mx-auto" />
              <h3 className="font-bold text-lg mb-2">10,000+ Users</h3>
              <p className="text-sol-200 text-sm">Expected platform adoption</p>
            </div>
            <div className="bg-sol-800/60 rounded-xl p-4 sm:p-6">
              <Globe className="w-8 h-8 text-sol-accent mb-3 mx-auto" />
              <h3 className="font-bold text-lg mb-2">Global Market</h3>
              <p className="text-sol-200 text-sm">$4.5T hedge fund industry</p>
            </div>
          </div>
        </div>
      </section>

      {/* Why Invest Section */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-extrabold text-center mb-16">
            Why Invest in <span className="text-sol-accent">Defunds</span>?
          </h2>
          
          <div className="grid lg:grid-cols-2 gap-12">
            <div className="space-y-8">
              <InvestmentReason
                icon={<TrendingUp className="w-8 h-8 text-sol-accent" />}
                title="Revolutionary Market Opportunity"
                description="First-mover advantage in the $4.5 trillion hedge fund industry transitioning to Web3. Traditional funds are slow, opaque, and expensive. We're building the future."
              />
              
              <InvestmentReason
                icon={<Shield className="w-8 h-8 text-sol-accent" />}
                title="Risk-Free Innovation"
                description="Self-custodial smart contracts eliminate counterparty risk. Investors maintain full control of their assets while benefiting from professional management."
              />
              
              <InvestmentReason
                icon={<Zap className="w-8 h-8 text-sol-accent" />}
                title="Scalable Technology"
                description="Built on Solana for instant settlements and minimal fees. Our open-source architecture allows rapid deployment of new fund strategies and global accessibility."
              />
            </div>
            
            <div className="bg-sol-800/60 rounded-2xl p-8">
              <h3 className="text-2xl font-bold mb-6 text-center">Investment Highlights</h3>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <span className="text-sol-accent font-bold">•</span>
                  <span><strong>Proven Team:</strong> TradiFi market team and Web3 veterans</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-sol-accent font-bold">•</span>
                  <span><strong>Technology:</strong> self-destructing key architecture</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-sol-accent font-bold">•</span>
                  <span><strong>Revenue Model:</strong> 0.1%% management/month + 20% of performance fees</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-sol-accent font-bold">•</span>
                  <span><strong>Early Stage Advantage:</strong> Pre-launch valuation opportunity</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-sol-accent font-bold">•</span>
                  <span><strong>Token Economics:</strong> Governance and fee-sharing utility token</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-sol-accent font-bold">•</span>
                  <span><strong>Global Compliance:</strong> Built for regulatory clarity and institutional adoption</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Investment Tiers Section */}
      <section className="py-20 px-4 bg-sol-800/30">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-extrabold text-center mb-16">
            Investment <span className="text-sol-accent">Opportunities</span>
          </h2>
          
          <div className="grid md:grid-cols-3 gap-8">
            <InvestmentTier
              tier="Angel"
              amount="$5K - $25K"
              features={[
                "Early investor status",
                "Increase position in 25% in 1 year at same terms",
              ]}
              highlight={false}
            />
            
            <InvestmentTier
              tier="Strategic"
              amount="$25k - $150K"
              features={[
                "Product input influence",
                 "Increase position in 30% in 1 year at same terms",
              ]}
              highlight={true}
            />
            
            <InvestmentTier
              tier="Lead"
              amount="$150K+"
              features={[
                "Board seat",
                 "Increase position in 35% in 1 year at same terms",
              ]}
              highlight={false}
            />
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-extrabold mb-8">
            Ready to <span className="text-sol-accent">Invest</span>?
          </h2>
          <p className="text-xl text-sol-200 mb-12 max-w-2xl mx-auto">
            Join visionary investors who are shaping the future of asset management. 
            Limited spots available for our seed round.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-6 justify-center mb-12">
            <Button
              size="lg"
              className="w-64 rounded-xl bg-gradient-to-r from-sol-accent to-cyan-400
                         px-8 py-3 font-semibold text-sol-900 shadow-lg text-lg
                         transition hover:scale-105"
              onClick={() => setOpenWaitlist(true)}
            >
              💰 Start Investment Process
            </Button>
          </div>
          
          <div className="grid md:grid-cols-2 gap-8 max-w-2xl mx-auto">
            <div className="bg-sol-800/60 rounded-xl p-6 flex items-center gap-4">
              <Mail className="w-6 h-6 text-sol-accent" />
              <div className="text-left">
                <h3 className="font-semibold">Email</h3>
                <p className="text-sol-200 text-sm">contact@defunds.finance</p>
              </div>
            </div>
            
            <div className="bg-sol-800/60 rounded-xl p-6 flex items-center gap-4">
              <Send className="w-6 h-6 text-sol-accent" />
              <div className="text-left">
                <h3 className="font-semibold">Telegram</h3>
                <p className="text-sol-200 text-sm">@felipe_fel</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Waitlist Modal */}
      {openWaitlist && (
        <WaitlistModal forRole="investor" onClose={() => setOpenWaitlist(false)} />
      )}
    </main>
  );
}

// Helper Components
function InvestmentReason({ icon, title, description }: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0">{icon}</div>
      <div>
        <h3 className="text-xl font-bold mb-2 text-sol-accent">{title}</h3>
        <p className="text-sol-200 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

function InvestmentTier({ tier, amount, features, highlight }: {
  tier: string;
  amount: string;
  features: string[];
  highlight: boolean;
}) {
  return (
    <div className={`rounded-2xl p-8 ${
      highlight 
        ? 'bg-gradient-to-b from-sol-accent/20 to-sol-800/60 border-2 border-sol-accent' 
        : 'bg-sol-800/60'
    }`}>
      {highlight && (
        <div className="text-center mb-4">
          <span className="bg-sol-accent text-sol-900 px-3 py-1 rounded-full text-sm font-bold">
            MOST POPULAR
          </span>
        </div>
      )}
      
      <h3 className="text-2xl font-bold text-center mb-2">{tier}</h3>
      <p className="text-xl text-sol-accent font-semibold text-center mb-6">{amount}</p>
      
      <ul className="space-y-3">
        {features.map((feature, index) => (
          <li key={index} className="flex items-start gap-3">
            <span className="text-sol-accent font-bold">✓</span>
            <span className="text-sol-200">{feature}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
