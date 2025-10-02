'use client';

import { useEffect, useMemo, useState } from 'react';
import { TrendingUp, Users, AlertTriangle, Shield, Eye, Building, Briefcase, Receipt, ChevronUp, ChevronDown } from 'lucide-react';
import { usePublicProfiles } from '@/lib/hooks/usePublicProfiles';
import { PublicProfileModal } from '@/components/PublicProfileModal';
import { Button } from '@/components/ui/button';
import WaitlistModal from '@/components/WaitlistModal';
import FundCard from '@/components/FundCard';
import { FundCardData, FundType } from '@/types/fund';
import { formatSol } from '@/lib/formatters';
import { InvestRwaModal } from '@/components/InvestRwaModal';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { CreateRwaProductModal } from '@/components/CreateRwaProductModal';

export default function RWAPage() {
  const [openWaitlist, setOpenWaitlist] = useState(false);
  const { filteredRwa, setRwaFilters, reload } = useRwaFiltering();
  const [showCreate, setShowCreate] = useState(false);

  return (
    <main className="min-h-screen bg-brand-black text-white">
      {/* Hero Section */}
  <section className="px-4 pt-24 sm:pt-28 pb-14">
        <div className="max-w-6xl mx-auto text-center">
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold mb-6 leading-tight">
              Real World <span className="text-brand-yellow">Assets</span>
          </h1>
          <p className="text-base sm:text-lg text-white/80 mb-10 leading-relaxed max-w-3xl mx-auto">
            Bridge traditional finance and DeFi. Discover on-chain access to real-world projects with transparent profiles and codified flows.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <button
              className="inline-flex items-center justify-center rounded-full bg-brand-yellow px-8 py-4 text-base font-semibold text-brand-black hover:brightness-110 transition min-w-[220px]"
              onClick={() => {
                const el = document.getElementById('rwa-products');
                el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              📊 View RWA Products
            </button>
            <button
              className="inline-flex items-center justify-center rounded-full border border-brand-yellow/80 px-8 py-4 text-base font-semibold text-brand-yellow hover:bg-brand-yellow hover:text-brand-black transition min-w-[220px]"
              onClick={() => setShowCreate(true)}
            >
              ➕ Create Product
            </button>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {[['Full Transparency','Public profiles with complete funding history', Eye], ['Invest in People','Back individuals with proven track records', Users], ['Real Returns','Competitive APY on verified projects', TrendingUp]].map(([t,b,Icon]) => (
              <div key={t as string} className="rounded-2xl p-6 bg-white/5 backdrop-blur-sm border border-white/10 text-left">
                {Icon && <Icon className="w-7 h-7 text-brand-yellow mb-4" />}
                <h3 className="font-semibold text-white mb-2">{t as string}</h3>
                <p className="text-sm text-white/70 leading-relaxed">{b as string}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How RWA Works Section */}
  <section className="py-5 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-center mb-14">How <span className="text-brand-yellow">RWA</span> Works</h2>
          
          <div className="grid lg:grid-cols-2 gap-12">
            <div className="space-y-8">
              <div className="flex gap-4">
                <div className="flex-shrink-0">
                  <Shield className="w-8 h-8 text-yellow-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-2 text-brand-yellow">On-Chain Transparency</h3>
                  <p className="text-white/70 leading-relaxed text-sm">
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
                  <h3 className="text-lg font-semibold mb-2 text-brand-yellow">Off-Chain Execution</h3>
                  <p className="text-white/70 leading-relaxed text-sm">
                    Once funded, money moves off-chain for real-world use. While we can&apos;t track 
                    exact usage, operators build reputation through successful project completion.
                  </p>
                </div>
              </div>
              
              <div className="flex gap-4">
                <div className="flex-shrink-0">
                  <Users className="w-8 h-8 text-brand-yellow" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-2 text-brand-yellow">Reputation-Based System</h3>
                  <p className="text-white/70 leading-relaxed text-sm">
                    Operators with successful project histories earn higher trust scores and 
                    access to larger funding rounds with better rates.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8">
              <h3 className="text-xl font-semibold mb-6 text-center text-white">Investment Process</h3>
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 bg-brand-surface/70 rounded-lg border border-white/10">
                  <span className="bg-brand-yellow text-brand-black px-2 py-1 rounded-full text-xs font-semibold">1</span>
                  <span>Operator creates public profile with project details</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-brand-surface/70 rounded-lg border border-white/10">
                  <span className="bg-brand-yellow text-brand-black px-2 py-1 rounded-full text-xs font-semibold">2</span>
                  <span>Investors review history and fund the project</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-brand-surface/70 rounded-lg border border-white/10">
                  <span className="bg-brand-yellow text-brand-black px-2 py-1 rounded-full text-xs font-semibold">3</span>
                  <span>Funds move off-chain for real-world execution</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-brand-surface/70 rounded-lg border border-white/10">
                  <span className="bg-brand-yellow text-brand-black px-2 py-1 rounded-full text-xs font-semibold">4</span>
                  <span>Returns paid back with APY to investors</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-brand-surface/70 rounded-lg border border-white/10">
                  <span className="bg-brand-yellow text-brand-black px-2 py-1 rounded-full text-xs font-semibold">5</span>
                  <span>Success builds operator&apos;s reputation score</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Project Types Section */}
  <section className="py-5 px-4 bg-brand-surface/20">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-center mb-14">Supported <span className="text-brand-yellow">Project Types</span></h2>
          
          <div className="grid md:grid-cols-3 gap-8">
            <ProjectType
              icon={<Receipt className="w-12 h-12 text-brand-yellow" />}
              title="Antecipate Cash Flow"
              description="Get immediate cash flow by selling your future receivables at a discount. Perfect for businesses with confirmed incoming payments."
              details={[
                "Invoice factoring",
                "Account receivables financing", 
                "Quick liquidity solutions",
                "Competitive discount rates"
              ]}
            />
            
            <ProjectType
              icon={<Building className="w-12 h-12 text-brand-yellow" />}
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
              icon={<Briefcase className="w-12 h-12 text-brand-yellow" />}
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
  <section className="py-5 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-brand-surface/40 backdrop-blur-sm border border-white/10 rounded-2xl p-8">
            <div className="flex items-center gap-4 mb-6">
              <AlertTriangle className="w-8 h-8 text-brand-yellow" />
              <h2 className="text-xl font-semibold text-brand-yellow">Important Risk Disclosure</h2>
            </div>
            
            <div className="space-y-4 text-white/70 text-sm">
              <p className="text-sm font-semibold text-white/80">
                RWA investments carry additional risks compared to traditional DeFi:
              </p>
              
              <ul className="space-y-2 pl-6">
                <li className="flex items-start gap-2">
                  <span className="text-brand-yellow mt-1">•</span>
                  <span className="text-white/70"><strong className="text-white">Off-chain execution:</strong> Once funds leave the platform, we cannot track their exact usage</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-brand-yellow mt-1">•</span>
                  <span className="text-white/70"><strong className="text-white">Operator dependency:</strong> Success depends entirely on the operator&apos;s competence and honesty</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-brand-yellow mt-1">•</span>
                  <span className="text-white/70"><strong className="text-white">Real-world risks:</strong> Projects face regulatory, market, and execution challenges</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-brand-yellow mt-1">•</span>
                  <span className="text-white/70"><strong className="text-white">Limited recourse:</strong> Recovery options may be limited if projects fail</span>
                </li>
              </ul>
              
              <p className="text-sm font-medium border-t border-white/10 pt-4 mt-6 text-white/80">
                Only invest what you can afford to lose. Do your own research on operators and projects.
              </p>
            </div>
          </div>
        </div>
      </section>

    {/* RWA Products Section */}
  <section id="rwa-products" className="py-5 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-center mb-10">RWA <span className="text-brand-yellow">Products</span></h2>

          {/* Filters (same theme as Funds, but with Operator + limited Type) */}
          <RWAFilterBar onChange={(f) => setRwaFilters(f)} />
      {/* Table listing mirroring Funds table */}
      <RwaTable items={filteredRwa} />
        </div>
      </section>

  {/* CTA Section removed per request */}

      {/* Waitlist Modal */}
      {openWaitlist && (
        <WaitlistModal forRole="investor" onClose={() => setOpenWaitlist(false)} />
      )}
      <CreateRwaProductModal isOpen={showCreate} onClose={() => setShowCreate(false)} onCreated={() => reload()} />
    </main>
  );
}

// Helper Components
/* ------------------------------------------------------------------
   RwaTable – institutional list with expandable detail rows (RWA)
------------------------------------------------------------------- */
function RwaTable({ items }: { items: FundCardData[] }) {
  const [sort, setSort] = useState<{ key: keyof FundCardData; dir: 'asc' | 'desc' }>({ key: 'tvl', dir: 'desc' });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Removed inline invite code capture; handled in InvestRwaModal
  const [investTarget, setInvestTarget] = useState<FundCardData | null>(null);
  const { getProfile, cache } = usePublicProfiles();
  const [profileWallet, setProfileWallet] = useState<string | null>(null);

  const sorted = useMemo(() => {
    const arr = [...items];
    arr.sort((a, b) => {
      const { key, dir } = sort;
      const av = (a as any)[key];
      const bv = (b as any)[key];
      if (av == null && bv == null) return 0;
      if (av == null) return dir === 'asc' ? -1 : 1;
      if (bv == null) return dir === 'asc' ? 1 : -1;
      if (typeof av === 'number' && typeof bv === 'number') return dir === 'asc' ? av - bv : bv - av;
      const as = String(av).toLowerCase();
      const bs = String(bv).toLowerCase();
      if (as < bs) return dir === 'asc' ? -1 : 1;
      if (as > bs) return dir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [items, sort]);

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const headerCell = (label: string, key: keyof FundCardData) => {
    const active = sort.key === key;
    return (
      <th
        onClick={() => setSort(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' })}
        className={`px-4 py-3 text-left text-xs font-semibold tracking-wide cursor-pointer select-none whitespace-nowrap ${active ? 'text-white' : 'text-white/70'} hover:text-white transition`}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          {active && (sort.dir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
        </span>
      </th>
    );
  };

  if (items.length === 0) return <p className="text-white/70 text-center py-8">No products match your filters.</p>;

  return (
    <div className="border border-white/10 rounded-2xl overflow-hidden bg-brand-surface/70 backdrop-blur-sm">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-brand-surface text-white/90">
            <th className="w-10"></th>
            {headerCell('Product', 'name')}
            {headerCell('Type', 'type')}
            {headerCell('TVL (SOL)', 'tvl')}
            {headerCell('Perf Fee %', 'perfFee')}
            {headerCell('Investors', 'investorCount')}
            <th className="px-4 py-3 text-right text-xs font-semibold text-white/70">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5 bg-brand-surface">
          {sorted.map(f => {
            const isOpen = expanded.has(f.id);
            const performanceData = (f.performance || []).map((p, idx, arr) => {
              if ('pnl' in p && (p as any).pnl !== undefined) return p as any;
              const base = arr[0]?.nav || 10;
              const pnl = p.nav - base;
              return { ...p, pnl, pnlPercentage: ((p.nav - base) / base) * 100 };
            });
            return (
              <>
                <tr
                  key={f.id}
                  className="group transition bg-brand-surface hover:bg-brand-yellow/5 hover:shadow-[0_0_0_1px_rgba(255,219,41,0.25)] hover:-translate-y-[1px] duration-200 ease-out"
                >
                  <td className="px-2 py-3 align-top">
                    <button
                      onClick={() => toggle(f.id)}
                      className="w-7 h-7 rounded-md bg-white/5 border border-white/10 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 group-hover:bg-brand-yellow/10 group-hover:border-brand-yellow/30 group-hover:text-white"
                      aria-label={isOpen ? 'Collapse' : 'Expand'}
                    >
                      {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </td>
                  <td className="px-4 py-3 align-top font-medium text-white whitespace-nowrap max-w-[240px] truncate">
                    <div className="truncate" title={f.name}>{f.name}</div>
                    {f.creatorWallet && (
                      <div className="mt-1 text-[11px] font-normal text-white/50 leading-tight">
                        <span className="text-white/40">by </span>
                        {(() => {
                          const prof = cache[f.creatorWallet];
                          const label = prof?.name ? prof.name : f.creatorWallet.slice(0,4)+"..."+f.creatorWallet.slice(-4);
                          return <button
                            type="button"
                            onClick={() => { if (f.creatorWallet) { getProfile(f.creatorWallet); setProfileWallet(f.creatorWallet); } }}
                            className="text-brand-yellow hover:underline decoration-dashed underline-offset-2"
                          >{label}</button>;
                        })()}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top text-white/70 whitespace-nowrap">{f.type}</td>
                  <td className="px-4 py-3 align-top tabular-nums text-white/80">{formatSol(f.tvl)}</td>
                  <td className="px-4 py-3 align-top tabular-nums text-white/80">{f.perfFee}%</td>
                  <td className="px-4 py-3 align-top tabular-nums text-white/80">{f.investorCount}</td>
                  <td className="px-4 py-3 align-top text-right">
                    <button
                      onClick={() => setInvestTarget(f)}
                      className="inline-flex items-center justify-center rounded-full bg-brand-yellow text-brand-black text-xs font-semibold px-4 py-2 hover:brightness-110 transition"
                    >
                      Invest
                    </button>
                  </td>
                </tr>
                {isOpen && (
                  <tr className="bg-brand-surface" key={f.id + '-detail'}>
                    <td colSpan={7} className="px-6 pb-8 pt-4">
                      <div className="grid lg:grid-cols-3 gap-8">
                        <div className="space-y-6 lg:col-span-1">
                          <div>
                            <h4 className="text-sm font-semibold text-white mb-1">Description</h4>
                            <p className="text-xs text-white/70 leading-relaxed">{f.description || '—'}</p>
                          </div>
                          <div>
                            <h4 className="text-sm font-semibold text-white mb-2">Stats</h4>
                            <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-white/70">
                              <li>Trades: <span className="text-white">{f.stats.total}</span></li>
                              <li>Win/Loss: <span className="text-white">{f.stats.wins}/{f.stats.losses}</span></li>
                              <li className="col-span-2">Avg Win: <span className="text-white">{f.stats.avgWinPct}% ({f.stats.avgWinSol} SOL)</span></li>
                              <li className="col-span-2">Avg Loss: <span className="text-white">{f.stats.avgLossPct}% ({f.stats.avgLossSol} SOL)</span></li>
                              <li className="col-span-2">Drawdown: <span className="text-white">{f.stats.drawdownPct}% ({f.stats.drawdownSol} SOL)</span></li>
                            </ul>
                          </div>
                          {f.inviteOnly && (
                            <div className="space-y-1">
                              <p className="text-[11px] text-brand-yellow font-medium">Invite code required</p>
                              <p className="text-[10px] text-white/40">You'll be asked for it when investing.</p>
                            </div>
                          )}
                          <div>
                            <button
                              onClick={() => setInvestTarget(f)}
                              className="inline-flex items-center justify-center rounded-full bg-brand-yellow text-brand-black text-xs font-semibold px-5 py-2 hover:brightness-110 transition"
                            >Invest Now</button>
                          </div>
                        </div>
                        <div className="lg:col-span-2">
                          <h4 className="text-sm font-semibold text-white mb-3">P&L Performance</h4>
                          <div className="h-56 bg-brand-surface/90 border border-white/10 rounded-xl p-3">
                            {performanceData.length > 1 ? (
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={performanceData}>
                                  <Line type="monotone" dataKey="pnl" stroke="var(--color-brand-yellow)" strokeWidth={2} dot={false} />
                                  <XAxis dataKey="date" hide />
                                  <YAxis hide domain={['dataMin', 'dataMax']} />
                                  <Tooltip formatter={(v: any) => [`${Number(v).toFixed(2)} SOL`, 'PnL']} labelFormatter={() => ''} />
                                </LineChart>
                              </ResponsiveContainer>
                            ) : (
                              <div className="flex items-center justify-center h-full text-xs text-white/50">Insufficient data</div>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
      {investTarget && (
        <InvestRwaModal
          isOpen={true}
          onClose={() => setInvestTarget(null)}
          product={{ fundId: investTarget.id, name: investTarget.name, accessMode: (investTarget as any).accessMode }}
          onInvested={() => { /* could trigger reload if needed */ }}
        />
      )}
      {profileWallet && (
        <PublicProfileModal
          open={true}
          onOpenChange={(v) => { if (!v) setProfileWallet(null); }}
          profile={cache[profileWallet]}
        />
      )}
    </div>
  );
}
function ProjectType({ icon, title, description, details }: {
  icon: React.ReactNode;
  title: string;
  description: string;
  details: string[];
}) {
  return (
    <div className="rounded-2xl p-8 bg-white/5 backdrop-blur-sm border border-white/10 hover:bg-white/10 transition-colors">
      <div className="flex items-center justify-center mb-6">
        {icon}
      </div>
      
  <h3 className="text-lg font-semibold text-center mb-4 text-brand-yellow">{title}</h3>
  <p className="text-white/70 text-center mb-6 leading-relaxed text-sm">{description}</p>
      
      <ul className="space-y-2">
        {details.map((detail, index) => (
          <li key={index} className="flex items-start gap-3">
            <span className="text-brand-yellow font-semibold">✓</span>
            <span className="text-white/70 text-sm">{detail}</span>
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
  <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4 bg-white/5 backdrop-blur-sm border border-white/10 p-4 rounded-2xl mb-8">
      {/* Operator ------------------------------------------------------ */}
      <div className="flex-1 min-w-[200px] sm:min-w-0 sm:flex-none">
  <label className="block text-white/80 text-sm mb-1">Operator</label>
        <input
          type="text"
          placeholder="search operator"
          className="input w-full sm:w-40"
          onChange={(e) => update({ query: e.target.value || undefined })}
        />
      </div>

      {/* Max perf-fee % ---------------------------------------------- */}
      <div className="flex-1 min-w-[120px] sm:min-w-0 sm:flex-none">
  <label className="block text-white/80 text-sm mb-1">Max perf-fee %</label>
        <input
          type="number"
          className="input w-full sm:w-24"
          onChange={(e) => update({ maxPerfFee: Number(e.target.value) || undefined })}
        />
      </div>

      {/* Max cap (SOL) ----------------------------------------------- */}
      <div className="flex-1 min-w-[140px] sm:min-w-0 sm:flex-none">
  <label className="block text-white/80 text-sm mb-1">Max cap (SOL)</label>
        <input
          type="number"
          className="input w-full sm:w-28"
          onChange={(e) => update({ maxCap: Number(e.target.value) || undefined })}
        />
      </div>

      {/* Type --------------------------------------------------------- */}
      <div className="flex-1 min-w-[160px] sm:min-w-0 sm:flex-none">
  <label className="block text-white/80 text-sm mb-1">Type</label>
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

// Remote-backed (no local mocks)

// Remote-backed RWA products loader + filters
function useRwaFiltering() {
  const [rwaFilters, setRwaFilters] = useState<RWAFilters>({});
  const [items, setItems] = useState<FundCardData[]>([]);

  const load = async () => {
    try {
      const res = await fetch('/api/rwa/real');
      if (!res.ok) return;
      const data = await res.json();
      const list = (data?.data?.items || []) as any[];
      const mapped: FundCardData[] = list.map((p) => ({
        id: p.fundId,
        name: p.name,
        handle: p.manager?.slice(0, 8) + '...',
        creatorWallet: p.manager,
        traderTwitter: '@' + (p.manager?.slice(0, 8) || 'user'),
        description: p.description,
        type: p.type as FundType,
        tvl: p.tvl || 0,
        perfFee: p.perfFee || 0,
        maxCap: p.maxCapacity || 0,
        investorCount: p.investorCount || 0,
        inviteOnly: !p.isPublic,
        performance: p.performance || [],
        stats: p.stats || {
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
      }));
      setItems(mapped);
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => { load(); }, []);

  const filteredRwa = useMemo(() => {
    return items.filter((p) => {
      if (rwaFilters.maxPerfFee !== undefined && p.perfFee > rwaFilters.maxPerfFee) return false;
      if (rwaFilters.maxCap !== undefined && p.maxCap > rwaFilters.maxCap) return false;
      if (rwaFilters.type && p.type !== rwaFilters.type) return false;
      if (rwaFilters.query) {
        const q = rwaFilters.query.toLowerCase();
        if (!p.handle.toLowerCase().includes(q) && !p.name.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [items, rwaFilters]);

  return { filteredRwa, setRwaFilters, reload: load };
}

