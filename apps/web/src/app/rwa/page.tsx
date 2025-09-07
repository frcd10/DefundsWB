'use client';

import { useMemo, useState } from 'react';
import { TrendingUp, Users, AlertTriangle, Shield, Eye, Building, Briefcase, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import WaitlistModal from '@/components/WaitlistModal';
import FundCard from '@/components/FundCard';
import { FundCardData, FundType } from '@/types/fund';

export default function RWAPage() {
  const [openWaitlist, setOpenWaitlist] = useState(false);
  const { filteredRwa, setRwaFilters } = useRwaFiltering();

  return (
    <main className="min-h-screen bg-sol-900 text-sol-50">
      {/* Hero Section */}
      <section className="relative bg-gradient-to-b from-sol-900 via-sol-850 to-sol-800 px-4 pt-16 sm:pt-28 pb-12 sm:pb-20">
        <div className="max-w-6xl mx-auto text-center">
          <h1 className="text-4xl sm:text-6xl font-extrabold mb-4 sm:mb-6 drop-shadow-lg">
            Real World Assets
            <span className="text-sol-accent block">On-Chain Meets Off-Chain</span>
          </h1>
          <p className="text-lg sm:text-xl text-sol-200 mb-6 sm:mb-8 max-w-4xl mx-auto leading-relaxed">
            Bridge the gap between traditional finance and DeFi. Invest in real-world projects 
            with transparent profiles, verified track records, and clear funding purposes.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8 sm:mb-12">
            <Button
              size="lg"
              className="w-64 rounded-xl bg-gradient-to-r from-sol-accent to-cyan-400
                         px-8 py-3 font-semibold text-sol-900 shadow-lg text-lg
                         transition hover:scale-105"
              onClick={() => {
                const el = document.getElementById('rwa-products');
                el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              📊 View Active Projects
            </Button>
          </div>

          <div className="grid md:grid-cols-3 gap-4 sm:gap-6 max-w-4xl mx-auto">
            <div className="bg-sol-800/60 rounded-xl p-4 sm:p-6">
              <Eye className="w-8 h-8 text-sol-accent mb-3 mx-auto" />
              <h3 className="font-bold text-lg mb-2">Full Transparency</h3>
              <p className="text-sol-200 text-sm">Public profiles with complete funding history</p>
            </div>
            <div className="bg-sol-800/60 rounded-xl p-4 sm:p-6">
              <Users className="w-8 h-8 text-sol-accent mb-3 mx-auto" />
              <h3 className="font-bold text-lg mb-2">Invest in People</h3>
              <p className="text-sol-200 text-sm">Back individuals with proven track records</p>
            </div>
            <div className="bg-sol-800/60 rounded-xl p-4 sm:p-6">
              <TrendingUp className="w-8 h-8 text-sol-accent mb-3 mx-auto" />
              <h3 className="font-bold text-lg mb-2">Real Returns</h3>
              <p className="text-sol-200 text-sm">Competitive APY on verified projects</p>
            </div>
          </div>
        </div>
      </section>

      {/* How RWA Works Section */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-extrabold text-center mb-16">
            How <span className="text-sol-accent">RWA</span> Works
          </h2>
          
          <div className="grid lg:grid-cols-2 gap-12">
            <div className="space-y-8">
              <div className="flex gap-4">
                <div className="flex-shrink-0">
                  <Shield className="w-8 h-8 text-sol-accent" />
                </div>
                <div>
                  <h3 className="text-xl font-bold mb-2 text-sol-accent">On-Chain Transparency</h3>
                  <p className="text-sol-200 leading-relaxed">
                    All funding commitments, user profiles, and project histories are recorded on-chain. 
                    Smart contracts ensure transparent tracking of investments and returns.
                  </p>
                </div>
              </div>
              
              <div className="flex gap-4">
                <div className="flex-shrink-0">
                  <AlertTriangle className="w-8 h-8 text-yellow-400" />
                </div>
                <div>
                  <h3 className="text-xl font-bold mb-2 text-yellow-400">Off-Chain Execution</h3>
                  <p className="text-sol-200 leading-relaxed">
                    Once funded, money moves off-chain for real-world use. While we can&apos;t track 
                    exact usage, operators build reputation through successful project completion.
                  </p>
                </div>
              </div>
              
              <div className="flex gap-4">
                <div className="flex-shrink-0">
                  <Users className="w-8 h-8 text-sol-accent" />
                </div>
                <div>
                  <h3 className="text-xl font-bold mb-2 text-sol-accent">Reputation-Based System</h3>
                  <p className="text-sol-200 leading-relaxed">
                    Operators with successful project histories earn higher trust scores and 
                    access to larger funding rounds with better rates.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="bg-sol-800/60 rounded-2xl p-8">
              <h3 className="text-2xl font-bold mb-6 text-center">Investment Process</h3>
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 bg-sol-700/50 rounded-lg">
                  <span className="bg-sol-accent text-sol-900 px-2 py-1 rounded-full text-sm font-bold">1</span>
                  <span>Operator creates public profile with project details</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-sol-700/50 rounded-lg">
                  <span className="bg-sol-accent text-sol-900 px-2 py-1 rounded-full text-sm font-bold">2</span>
                  <span>Investors review history and fund the project</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-sol-700/50 rounded-lg">
                  <span className="bg-sol-accent text-sol-900 px-2 py-1 rounded-full text-sm font-bold">3</span>
                  <span>Funds move off-chain for real-world execution</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-sol-700/50 rounded-lg">
                  <span className="bg-sol-accent text-sol-900 px-2 py-1 rounded-full text-sm font-bold">4</span>
                  <span>Returns paid back with APY to investors</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-sol-700/50 rounded-lg">
                  <span className="bg-sol-accent text-sol-900 px-2 py-1 rounded-full text-sm font-bold">5</span>
                  <span>Success builds operator&apos;s reputation score</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Project Types Section */}
      <section className="py-20 px-4 bg-sol-800/30">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-extrabold text-center mb-16">
            Supported <span className="text-sol-accent">Project Types</span>
          </h2>
          
          <div className="grid md:grid-cols-3 gap-8">
            <ProjectType
              icon={<Receipt className="w-12 h-12 text-sol-accent" />}
              title="Antecipate Recebiveis"
              description="Get immediate cash flow by selling your future receivables at a discount. Perfect for businesses with confirmed incoming payments."
              details={[
                "Invoice factoring",
                "Account receivables financing", 
                "Quick liquidity solutions",
                "Competitive discount rates"
              ]}
            />
            
            <ProjectType
              icon={<Building className="w-12 h-12 text-sol-accent" />}
              title="Land & Construction"
              description="Fund real estate developments from land acquisition to construction completion. Transparent project milestones and progress tracking."
              details={[
                "Land acquisition financing",
                "Construction project funding",
                "Development milestone tracking",
                "Property investment opportunities"
              ]}
            />
            
            <ProjectType
              icon={<Briefcase className="w-12 h-12 text-sol-accent" />}
              title="Business Ventures"
              description="Create and fund new business ventures with equity sharing. Investors receive percentage ownership in growing companies."
              details={[
                "Startup funding",
                "Business expansion capital",
                "Equity sharing agreements",
                "Revenue-based financing"
              ]}
            />
          </div>
        </div>
      </section>

      {/* Risk Warning Section */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-gradient-to-r from-yellow-900/30 to-red-900/30 border-2 border-yellow-400/50 rounded-2xl p-8">
            <div className="flex items-center gap-4 mb-6">
              <AlertTriangle className="w-8 h-8 text-yellow-400" />
              <h2 className="text-2xl font-bold text-yellow-400">Important Risk Disclosure</h2>
            </div>
            
            <div className="space-y-4 text-sol-200">
              <p className="text-lg font-semibold">
                RWA investments carry additional risks compared to traditional DeFi:
              </p>
              
              <ul className="space-y-2 pl-6">
                <li className="flex items-start gap-2">
                  <span className="text-yellow-400 mt-1">•</span>
                  <span><strong>Off-chain execution:</strong> Once funds leave the platform, we cannot track their exact usage</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-yellow-400 mt-1">•</span>
                  <span><strong>Operator dependency:</strong> Success depends entirely on the operator&apos;s competence and honesty</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-yellow-400 mt-1">•</span>
                  <span><strong>Real-world risks:</strong> Projects face regulatory, market, and execution challenges</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-yellow-400 mt-1">•</span>
                  <span><strong>Limited recourse:</strong> Recovery options may be limited if projects fail</span>
                </li>
              </ul>
              
              <p className="text-lg font-semibold border-t border-sol-600 pt-4 mt-6">
                Only invest what you can afford to lose. Do your own research on operators and projects.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* RWA Products Section */}
      <section id="rwa-products" className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-extrabold text-center mb-10">
            RWA <span className="text-sol-accent">Products</span>
          </h2>

          {/* Filters (same theme as Funds, but with Operator + limited Type) */}
          <RWAFilterBar onChange={(f) => setRwaFilters(f)} />

          {/* Cards grid (reuse FundCard for consistent theme) */}
      {filteredRwa.length === 0 ? (
            <p className="text-sol-50 text-center py-8">No products match your filters.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {filteredRwa.map((f: FundCardData) => (
                <FundCard f={f} key={f.id} />
              ))}
            </div>
          )}
        </div>
      </section>

  {/* CTA Section removed per request */}

      {/* Waitlist Modal */}
      {openWaitlist && (
        <WaitlistModal forRole="investor" onClose={() => setOpenWaitlist(false)} />
      )}
    </main>
  );
}

// Helper Components
function ProjectType({ icon, title, description, details }: {
  icon: React.ReactNode;
  title: string;
  description: string;
  details: string[];
}) {
  return (
    <div className="bg-sol-800/60 rounded-2xl p-8 hover:bg-sol-700/60 transition-colors">
      <div className="text-center mb-6">
        {icon}
      </div>
      
      <h3 className="text-xl font-bold text-center mb-4 text-sol-accent">{title}</h3>
      <p className="text-sol-200 text-center mb-6 leading-relaxed">{description}</p>
      
      <ul className="space-y-2">
        {details.map((detail, index) => (
          <li key={index} className="flex items-start gap-3">
            <span className="text-sol-accent font-bold">✓</span>
            <span className="text-sol-200 text-sm">{detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// RWA Products: Filters + Data + Logic (local to this page)
// ────────────────────────────────────────────────────────────────────
type RWAType = Extract<FundType, 'Construction' | 'Advance Receivable'>;

interface RWAFilters {
  query?: string; // Operator
  maxPerfFee?: number;
  maxCap?: number;
  type?: RWAType;
}

function RWAFilterBar({ onChange }: { onChange: (f: RWAFilters) => void }) {
  const [filters, setFilters] = useState<RWAFilters>({});
  const update = (partial: Partial<RWAFilters>) => {
    const next = { ...filters, ...partial };
    setFilters(next);
    onChange(next);
  };

  return (
    <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4 bg-sol-800/40 p-4 rounded-xl mb-10">
      {/* Operator ------------------------------------------------------ */}
      <div className="flex-1 min-w-[200px] sm:min-w-0 sm:flex-none">
        <label className="block text-sol-100 text-sm mb-1">Operator</label>
        <input
          type="text"
          placeholder="search operator"
          className="input w-full sm:w-40"
          onChange={(e) => update({ query: e.target.value || undefined })}
        />
      </div>

      {/* Max perf-fee % ---------------------------------------------- */}
      <div className="flex-1 min-w-[120px] sm:min-w-0 sm:flex-none">
        <label className="block text-sol-100 text-sm mb-1">Max perf-fee %</label>
        <input
          type="number"
          className="input w-full sm:w-24"
          onChange={(e) => update({ maxPerfFee: Number(e.target.value) || undefined })}
        />
      </div>

      {/* Max cap (SOL) ----------------------------------------------- */}
      <div className="flex-1 min-w-[140px] sm:min-w-0 sm:flex-none">
        <label className="block text-sol-100 text-sm mb-1">Max cap (SOL)</label>
        <input
          type="number"
          className="input w-full sm:w-28"
          onChange={(e) => update({ maxCap: Number(e.target.value) || undefined })}
        />
      </div>

      {/* Type --------------------------------------------------------- */}
      <div className="flex-1 min-w-[160px] sm:min-w-0 sm:flex-none">
        <label className="block text-sol-100 text-sm mb-1">Type</label>
        <select
          className="input w-full"
          defaultValue=""
          onChange={(e) => update({ type: (e.target.value as RWAType) || undefined })}
        >
          <option value="">Any</option>
          <option value="Construction">Construction</option>
          <option value="Advance Receivable">Advance Receivable</option>
        </select>
      </div>
    </div>
  );
}

// Mock RWA products (one per type)
const rwaProducts: FundCardData[] = [
  {
    id: 'rwa-construction-1',
    name: 'Rio Skyline Tower',
  handle: 'Acme Builders', // Operator
  creatorWallet: 'ACM3bu1Ld3r5W4ll3t0000000000000000000000000',
    traderTwitter: '@acme_build',
    description:
      'High-rise residential development in Rio de Janeiro with phased milestones and secured permits.',
    type: 'Construction' as FundType,
    tvl: 2_500,
    perfFee: 12,
    maxCap: 10_000,
    investorCount: 18,
    inviteOnly: false,
    performance: [
      { date: '2025-06-01', nav: 10 },
      { date: '2025-07-01', nav: 10.8 },
      { date: '2025-08-01', nav: 11.1 },
      { date: '2025-09-01', nav: 11.3 },
    ],
    stats: {
      total: 0,
      wins: 0,
      losses: 0,
      avgWinPct: 0,
      avgWinSol: 0,
      avgLossPct: 0,
      avgLossSol: 0,
      drawdownPct: 0,
      drawdownSol: 0,
      topWins: [],
      topLosses: [],
    },
  },
  {
    id: 'rwa-advrec-1',
    name: 'Retail Receivables Q4',
  handle: 'Nova Financing', // Operator
  creatorWallet: 'N0V4F1n4nc1ngW4ll3t0000000000000000000000000',
    traderTwitter: '@nova_fin',
    description:
      'Advance on verified retail invoices with 60–90 day payment horizon and diversified counterparties.',
    type: 'Advance Receivable' as FundType,
    tvl: 1_200,
    perfFee: 8,
    maxCap: 5_000,
    investorCount: 32,
    inviteOnly: false,
    performance: [
      { date: '2025-06-01', nav: 10 },
      { date: '2025-07-01', nav: 10.4 },
      { date: '2025-08-01', nav: 10.7 },
      { date: '2025-09-01', nav: 10.9 },
    ],
    stats: {
      total: 0,
      wins: 0,
      losses: 0,
      avgWinPct: 0,
      avgWinSol: 0,
      avgLossPct: 0,
      avgLossSol: 0,
      drawdownPct: 0,
      drawdownSol: 0,
      topWins: [],
      topLosses: [],
    },
  },
];

// Local state and filtering for RWA products
function useRwaFiltering() {
  const [rwaFilters, setRwaFilters] = useState<RWAFilters>({});
  const filteredRwa = useMemo(() => {
    return rwaProducts.filter((p) => {
      if (rwaFilters.maxPerfFee !== undefined && p.perfFee > rwaFilters.maxPerfFee)
        return false;
      if (rwaFilters.maxCap !== undefined && p.maxCap > rwaFilters.maxCap)
        return false;
      if (rwaFilters.type && p.type !== rwaFilters.type) return false;
      if (rwaFilters.query) {
        const q = rwaFilters.query.toLowerCase();
        if (!p.handle.toLowerCase().includes(q) && !p.name.toLowerCase().includes(q))
          return false;
      }
      return true;
    });
  }, [rwaFilters]);

  return { filteredRwa, setRwaFilters };
}

