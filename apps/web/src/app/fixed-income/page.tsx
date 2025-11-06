'use client';

import React, { useEffect, useMemo, useState } from 'react';

// Types
interface Protocol {
  name: string;
  asset: string; // e.g., "USDC", "SOL"
  apy: number; // e.g., 7.8 => 7.8%
  tvl: number; // absolute in USD (e.g., 380_000_000)
  logo?: string;
}

interface LiquidStakingProtocol {
  name: string; // e.g., "Jupiter"
  symbol: string; // e.g., "jSOL"
  apy: number; // e.g., 7.8
  logo?: string;
  color?: string; // for placeholder logo circle
}

type SortKey = 'apy' | 'tvl';
type SortOrder = 'asc' | 'desc';

// Utility helpers
const classNames = (...args: Array<string | false | null | undefined>) =>
  args.filter(Boolean).join(' ');

const formatPercent = (value: number) => `${value.toFixed(1)}%`;

const getApyColor = (apy: number) => {
  if (apy > 8) return 'text-emerald-400';
  if (apy >= 6) return 'text-brand-yellow';
  return 'text-white/80';
};

const formatNumber = (num: number) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(num);

const formatCurrencyShort = (value: number) => {
  // value is absolute USD number (e.g., 380_000_000)
  if (value >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(0)}M`;
  }
  return `$${formatNumber(value)}`;
};

const formatSol = (value: number) =>
  `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} SOL`;

// Generic image with fallback display
const ImageWithFallback: React.FC<{
  src: string;
  alt: string;
  className?: string;
  fallbackClassName?: string;
  fallback?: React.ReactNode;
  width?: number;
  height?: number;
  style?: React.CSSProperties;
}> = ({ src, alt, className, fallbackClassName, fallback, width, height, style }) => {
  const [errored, setErrored] = useState(false);
  if (!errored) {
    return (
      // eslint-disable-next-line jsx-a11y/alt-text
      <img
        src={src}
        alt={alt}
        className={className}
        width={width}
        height={height}
        style={style}
        onError={() => setErrored(true)}
      />
    );
  }
  return (
    <div className={fallbackClassName} style={{ width, height, ...style }}>{fallback}</div>
  );
};

const TokenIcon: React.FC<{ asset: string; size?: number }> = ({ asset, size = 18 }) => {
  const src = `/images/${asset.toLowerCase()}.png`;
  return (
    <ImageWithFallback
      src={src}
      alt={`${asset} logo`}
      className="rounded-full object-contain"
      fallbackClassName="rounded-full bg-white/10 flex items-center justify-center"
      fallback={<span className="text-[10px] text-white/70 font-medium">{asset.slice(0, 2).toUpperCase()}</span>}
      width={size}
      height={size}
    />
  );
};

// Simple responsive line chart using SVG (no external deps)
const LineChartMini: React.FC<{
  values: number[];
  labels?: string[];
  height?: number;
  stroke?: string;
  strokeWidth?: number;
  fill?: string;
}> = ({ values, labels, height = 180, stroke = 'var(--color-brand-yellow, #FFDB29)', strokeWidth = 2, fill = 'rgba(255,219,41,0.12)' }) => {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const n = values.length;
  const points = values.map((v, i) => {
    const x = (i / (n - 1)) * 100; // percent (0..100)
    const y = 100 - ((v - min) / range) * 100; // invert for SVG
    return { x, y };
  });
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ');
  const area = `M 0,100 L ${points.map(p => `${p.x},${p.y}`).join(' L ')} L 100,100 Z`;

  return (
    <div className="w-full">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height }}>
        <defs>
          <linearGradient id="pnlStroke" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="1" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0.5" />
          </linearGradient>
          <linearGradient id="pnlFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={fill} stopOpacity="0.6" />
            <stop offset="100%" stopColor={fill} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#pnlFill)" stroke="none" />
        <path d={path} fill="none" stroke="url(#pnlStroke)" strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </div>
  );
};

const useRevealOnScroll = () => {
  useEffect(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>('.reveal-on-scroll'));
    if (!('IntersectionObserver' in window)) {
      elements.forEach((el) => el.classList.add('show'));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('show');
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.1 }
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
};

const GradientButton: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  as?: 'button' | 'a';
  href?: string;
  target?: string;
  rel?: string;
}> = ({ children, onClick, as = 'button', href, target, rel }) => {
  const common = classNames(
    'inline-flex items-center justify-center rounded-full px-4 py-2 font-semibold',
    'bg-brand-yellow text-brand-black',
    'hover:brightness-110 hover:scale-[1.02] transition-transform duration-200'
  );
  if (as === 'a' && href) {
    return (
      <a className={common} href={href} target={target} rel={rel} onClick={onClick}>
        {children}
      </a>
    );
  }
  return (
    <button className={common} onClick={onClick} type="button">
      {children}
    </button>
  );
};

const Badge: React.FC<{ label: string; color: 'yellow' | 'blue' | 'pink' | 'green' }> = ({ label, color }) => {
  const colorMap = {
    yellow: 'bg-yellow-500/20 text-yellow-300',
    blue: 'bg-blue-500/20 text-blue-300',
    pink: 'bg-pink-500/20 text-pink-300',
    green: 'bg-green-500/20 text-green-300',
  } as const;
  return (
    <span
      className={classNames(
        'inline-flex items-center rounded-md px-2 py-1 text-xs font-medium',
        colorMap[color]
      )}
    >
      {label}
    </span>
  );
};

const LoadingSkeletonCard: React.FC = () => (
  <div
    className={classNames(
      'h-40 rounded-xl border border-gray-800 bg-gray-900/50 backdrop-blur-sm',
      'animate-pulse'
    )}
  >
    <div className="p-4 h-full flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-gray-800" />
        <div className="flex-1">
          <div className="h-3 w-1/2 bg-gray-800 rounded" />
          <div className="mt-2 h-3 w-1/3 bg-gray-800 rounded" />
        </div>
      </div>
      <div className="mt-auto h-9 w-full bg-gray-800 rounded" />
    </div>
  </div>
);

const SortHeader: React.FC<{
  label: string;
  active: boolean;
  order: SortOrder;
}> = ({ label, active, order }) => (
  <span className="inline-flex items-center gap-1 select-none">
    {label}
    <svg
      className={classNames('h-3 w-3 transition-transform', active ? 'opacity-100' : 'opacity-40')}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      {order === 'desc' ? (
        <path d="M10 14l-6-6h12l-6 6z" />
      ) : (
        <path d="M10 6l6 6H4l6-6z" />
      )}
    </svg>
  </span>
);

const HighYieldFixedIncome: React.FC = () => {
  useRevealOnScroll();

  // Mock Data
  const LSTs: LiquidStakingProtocol[] = [
    { name: 'Jupiter', symbol: 'jSOL', apy: 7.8, color: 'bg-purple-500', logo: '/images/jupiter.png' },
    { name: 'Phantom', symbol: 'pSOL', apy: 7.6, color: 'bg-violet-500', logo: '/images/phantom.png' },
    { name: 'Jito', symbol: 'jitoSOL', apy: 8.3, color: 'bg-indigo-500', logo: '/images/jito.png' },
    { name: 'Marinade', symbol: 'mSOL', apy: 7.4, color: 'bg-fuchsia-500', logo: '/images/marinade.png' },
    { name: 'Blaze', symbol: 'bSOL', apy: 7.9, color: 'bg-pink-500', logo: '/images/blaze.png' },
    { name: 'Solflare', symbol: 'sfSOL', apy: 7.1, color: 'bg-blue-500', logo: '/images/solflare.png' },
    { name: 'Sanctum', symbol: 'INF', apy: 8.0, color: 'bg-emerald-500', logo: '/images/sanctum.png' },
  ];

  const stablecoinVaults: Protocol[] = [
    { name: 'Jupiter', asset: 'USDC', apy: 7.8, tvl: 380_000_000 },
    { name: 'Kamino', asset: 'USDC', apy: 8.2, tvl: 245_000_000 },
    { name: 'Drift', asset: 'USDT', apy: 6.9, tvl: 180_000_000 },
    { name: 'MarginFi', asset: 'USDC', apy: 7.5, tvl: 156_000_000 },
    { name: 'Solend', asset: 'USDT', apy: 6.2, tvl: 98_000_000 },
    { name: 'Mango', asset: 'USDC', apy: 8.5, tvl: 67_000_000 },
  ];

  const solVaults: Protocol[] = [
    { name: 'Kamino', asset: 'SOL', apy: 9.2, tvl: 450_000_000 },
    { name: 'Drift', asset: 'SOL', apy: 8.8, tvl: 320_000_000 },
    { name: 'MarginFi', asset: 'SOL', apy: 8.5, tvl: 210_000_000 },
    { name: 'Jupiter', asset: 'SOL', apy: 7.9, tvl: 189_000_000 },
    { name: 'Hubble', asset: 'SOL', apy: 9.5, tvl: 78_000_000 },
  ];

  // Loading states for future API integration
  const [loadingLST, setLoadingLST] = useState(true);
  const [loadingStable, setLoadingStable] = useState(true);
  const [loadingSol, setLoadingSol] = useState(true);

  useEffect(() => {
    const timers = [
      setTimeout(() => setLoadingLST(false), 700),
      setTimeout(() => setLoadingStable(false), 900),
      setTimeout(() => setLoadingSol(false), 1000),
    ];
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  // Sorting state
  const [stableSortKey, setStableSortKey] = useState<SortKey>('apy');
  const [stableSortOrder, setStableSortOrder] = useState<SortOrder>('desc');
  const [solSortKey, setSolSortKey] = useState<SortKey>('apy');
  const [solSortOrder, setSolSortOrder] = useState<SortOrder>('desc');

  const sortedStable = useMemo(() => {
    const data = [...stablecoinVaults];
    data.sort((a, b) => {
      const dir = stableSortOrder === 'asc' ? 1 : -1;
      return (a[stableSortKey] - b[stableSortKey]) * dir;
    });
    return data;
  }, [stablecoinVaults, stableSortKey, stableSortOrder]);

  const sortedSol = useMemo(() => {
    const data = [...solVaults];
    data.sort((a, b) => {
      const dir = solSortOrder === 'asc' ? 1 : -1;
      return (a[solSortKey] - b[solSortKey]) * dir;
    });
    return data;
  }, [solVaults, solSortKey, solSortOrder]);

  const toggleSort = (
    forTable: 'stable' | 'sol',
    key: SortKey
  ) => {
    if (forTable === 'stable') {
      if (stableSortKey === key) {
        setStableSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
      } else {
        setStableSortKey(key);
        setStableSortOrder('desc');
      }
    } else {
      if (solSortKey === key) {
        setSolSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
      } else {
        setSolSortKey(key);
        setSolSortOrder('desc');
      }
    }
  };

  const handleStakeClick = (label: string) => () => void label; // no-op, avoid console noise
  const handleInvestClick = (label: string) => () => void label; // no-op, avoid console noise

  return (
    <div
      className={classNames(
        'min-h-screen w-full text-white font-sans',
        'bg-brand-black'
      )}
      style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial' }}
    >
      {/* Local styles for reveal animation */}
      <style>{`
        .reveal-on-scroll{opacity:0;transform:translateY(16px);transition:opacity .6s ease, transform .6s ease}
        .reveal-on-scroll.show{opacity:1;transform:none}
        .tooltip-panel{transition:opacity .2s ease, transform .2s ease; transform: translateY(4px)}
        .group:hover .tooltip-panel{opacity:1; transform: translateY(0)}
      `}</style>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
        {/* Page Header */}
        <header className="reveal-on-scroll text-center mb-10">
          <h1 className={classNames(
            'text-4xl sm:text-6xl font-extrabold tracking-tight text-white'
          )}>High-Yield <span className="text-brand-yellow">Fixed Income</span></h1>
          <p className="mt-3 text-white/70 max-w-2xl mx-auto">
            Earn sustainable yields on Solana through staking and DeFi vaults
          </p>
          <p className="mt-3 text-white/70 max-w-2xl mx-auto">
            On this page manager will be able to view fixed income options from all solana ecosystem, interact via cpi to all major programs and create a portfolio focusing in fixed income
          </p>
          <div className="mt-3 flex items-center justify-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-yellow/30 bg-brand-yellow/10 px-3 py-1 text-sm text-brand-yellow">
              Mock Data — Q1 2026 (As on our Roadmap)
            </span>
          </div>
        </header>
        
        {/* Portfolio Overview */}
        <section className="reveal-on-scroll mb-10">
          <div className={classNames(
            'rounded-2xl border border-white/10 bg-brand-surface/70 backdrop-blur-sm',
            'p-5 sm:p-6'
          )}>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-white">Blchead Fixed Income Vault</h2>
                <p className="text-white/60 text-sm mt-1">Manager portfolio overview</p>
              </div>
              <div className="flex items-center gap-6 text-sm">
                <div>
                  <div className="text-white/60">Investors</div>
                  <div className="text-white font-semibold tabular-nums">187</div>
                </div>
                <div>
                  <div className="text-white/60">TVL</div>
                  <div className="text-white font-semibold tabular-nums">{formatSol(781)}</div>
                </div>
              </div>
            </div>

            {/* PnL Graph */}
            {(() => {
              const pnlValues = [20000, 20500, 21000, 21250, 21800, 22400, 23200, 23900, 24800, 25500, 26200, 27000];
              const pnlPct = ((pnlValues[pnlValues.length - 1] - pnlValues[0]) / pnlValues[0]) * 100;
              return (
                <div className="mt-5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm text-white/60">PnL (12 months)</div>
                    <div className="text-sm font-semibold text-emerald-400">+{pnlPct.toFixed(1)}%</div>
                  </div>
                  <LineChartMini values={pnlValues} />
                </div>
              );
            })()}

            {/* Allocation */}
            {(() => {
              type Alloc = { name: string; sol: number };
              const total = 781;
              const native: Alloc[] = [
                { name: 'Validator Delegation', sol: 100 },
              ];
              const lst: Alloc[] = [
                { name: 'Jupiter jSOL', sol: 60 },
                { name: 'Jito jitoSOL', sol: 50 },
                { name: 'Marinade mSOL', sol: 40 },
                { name: 'Blaze bSOL', sol: 25 },
                { name: 'Phantom pSOL', sol: 15 },
                { name: 'Solflare sfSOL', sol: 5 },
                { name: 'Sanctum INF', sol: 5 },
              ];
              const usdc: Alloc[] = [
                { name: 'Jupiter', sol: 70 },
                { name: 'Kamino', sol: 60 },
                { name: 'MarginFi', sol: 50 },
                { name: 'Mango', sol: 40 },
              ];
              const usdt: Alloc[] = [
                { name: 'Drift', sol: 70 },
                { name: 'Solend', sol: 50 },
              ];
              const sol: Alloc[] = [
                { name: 'Kamino', sol: 50 },
                { name: 'Drift', sol: 40 },
                { name: 'MarginFi', sol: 30 },
                { name: 'Jupiter', sol: 21 },
              ];

              const Card: React.FC<{ title: string; items: Alloc[] }> = ({ title, items }) => (
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="text-sm font-semibold text-white mb-3">{title}</div>
                  <ul className="space-y-2 text-sm">
                    {items.map((it) => {
                      const pct = (it.sol / total) * 100;
                      return (
                        <li key={`${title}-${it.name}`} className="flex items-center justify-between gap-3">
                          <span className="text-white/80 truncate" title={it.name}>{it.name}</span>
                          <span className="text-white/60 tabular-nums">{it.sol} <span className="text-white/40">SOL</span> · <span className="text-white/70">{pct.toFixed(1)}%</span></span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );

              const sumAll = [...native, ...lst, ...usdc, ...usdt, ...sol].reduce((a, b) => a + b.sol, 0);

              return (
                <div className="mt-6">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm text-white/60">Allocation (Total {formatSol(total)})</div>
                    <div className="text-xs text-white/50">Checksums: {sumAll} SOL · 100%</div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                    <Card title="Native" items={native} />
                    <Card title="LST" items={lst} />
                    <Card title="USDC" items={usdc} />
                    <Card title="USDT" items={usdt} />
                    <Card title="SOL" items={sol} />
                  </div>
                </div>
              );
            })()}
          </div>
        </section>

        {/* Native vs Liquid Staking Comparison - compact table */}
        <section className="reveal-on-scroll mb-10">
          <div className={classNames(
            'rounded-2xl border border-white/10 bg-brand-surface/70 backdrop-blur-sm',
            'p-4 sm:p-6 hover:scale-[1.02] transition-transform duration-200'
          )}>
            <h2 className="text-2xl font-extrabold text-white mb-4">Native vs Liquid Staking</h2>
            <div className="w-full overflow-x-auto">
              <table className="min-w-[560px] w-full text-sm">
                <thead>
                  <tr className="text-white/70">
                    <th className="px-3 py-2 text-left font-semibold">Aspect</th>
                    <th className="px-3 py-2 text-left font-semibold">Native</th>
                    <th className="px-3 py-2 text-left font-semibold">Liquid</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  <tr>
                    <td className="px-3 py-2 align-top whitespace-nowrap">
                      <div className="flex items-center gap-2"><Badge label="Method" color="yellow" /><span className="text-white/80">Method</span></div>
                    </td>
                    <td className="px-3 py-2 align-top text-white/80">Delegate SOL directly to a validator</td>
                    <td className="px-3 py-2 align-top text-white/80">Delegate SOL to a smart contract or staking pool</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 align-top whitespace-nowrap">
                      <div className="flex items-center gap-2"><Badge label="Rewards" color="yellow" /><span className="text-white/80">Rewards Distribution</span></div>
                    </td>
                    <td className="px-3 py-2 align-top text-white/80">Amount of SOL increases over time</td>
                    <td className="px-3 py-2 align-top text-white/80">Price of LST increases over time</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 align-top whitespace-nowrap">
                      <div className="flex items-center gap-2"><Badge label="Unstaking" color="yellow" /><span className="text-white/80">Unstaking Period</span></div>
                    </td>
                    <td className="px-3 py-2 align-top text-white/80">Up to 3 days</td>
                    <td className="px-3 py-2 align-top text-white/80">Instant</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 align-top whitespace-nowrap">
                      <div className="flex items-center gap-2"><Badge label="Liquidity" color="yellow" /><span className="text-white/80">Liquid for DeFi</span></div>
                    </td>
                    <td className="px-3 py-2 align-top text-white/80">❌ No</td>
                    <td className="px-3 py-2 align-top text-white/80">✅ Yes</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Native Staking */}
        <section className="reveal-on-scroll mb-10">
          <div className={classNames(
            'rounded-2xl border border-white/10 bg-brand-surface/70 backdrop-blur-sm p-6',
            'hover:scale-[1.02] transition-transform duration-200'
          )}>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h2 className="text-2xl font-extrabold text-white">Native Staking</h2>
                <p className="text-white/70 mt-1">Stake SOL directly to validators and earn ~7% APY</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-white/60 text-sm">Current APY</p>
                  <p className={classNames('text-xl font-semibold', getApyColor(7.2))}>7.2%</p>
                </div>
                <GradientButton
                  as="a"
                  href="https://solana.com/staking"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Stake Native Now
                </GradientButton>
              </div>
            </div>
          </div>
        </section>

        {/* Liquid Staking Tokens */}
        <section className="reveal-on-scroll mb-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-2xl font-extrabold text-white">Liquid Staking Tokens (LSTs)</h2>
            {/* Risks badge with tooltip */}
            <div className="relative group">
              <span className="inline-flex items-center gap-2 rounded-full border border-brand-yellow/30 bg-brand-yellow/10 px-3 py-1 text-sm text-brand-yellow hover:scale-[1.02] transition-transform duration-200 cursor-help">
                <span aria-hidden>⚠️</span> Risks
              </span>
              <div className="tooltip-panel pointer-events-none absolute right-0 z-20 mt-2 w-80 rounded-xl border border-white/10 bg-black/90 p-4 text-sm text-white/80 opacity-0">
                <p className="font-semibold text-white mb-2">Potential risks of liquid staking:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Liquidity constraints: Converting LSTs back to SOL might be challenging during high demand</li>
                  <li>De-pegging risks: LST value can diverge from SOL during market volatility</li>
                  <li>Smart contract vulnerabilities: Bugs could lead to financial losses</li>
                  <li>Regulatory uncertainty: Evolving regulations may impact protocol operations</li>
                </ul>
              </div>
            </div>
          </div>

          {loadingLST ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <LoadingSkeletonCard key={i} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {LSTs.map((p) => (
                <div
                  key={p.name}
                  className={classNames(
                    'rounded-2xl border border-white/10 bg-brand-surface/70 backdrop-blur-sm p-4',
                    'hover:scale-[1.02] transition-transform duration-200 flex flex-col'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10">
                      <ImageWithFallback
                        src={p.logo || `/images/${p.name.toLowerCase()}.png`}
                        alt={`${p.name} logo`}
                        className="h-10 w-10 rounded-full object-cover"
                        width={40}
                        height={40}
                        fallbackClassName={classNames('h-10 w-10 rounded-full', p.color || 'bg-white/10')}
                        fallback={<span className="sr-only">{p.symbol}</span>}
                      />
                    </div>
                    <div>
                      <p className="text-white font-semibold leading-tight">{p.name}</p>
                      <p className="text-xs text-white/60">{p.symbol}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-white/60">APY</p>
                      <p className={classNames('text-lg font-semibold', getApyColor(p.apy))}>{formatPercent(p.apy)}</p>
                    </div>
                    <GradientButton onClick={handleStakeClick(`${p.name} ${p.symbol}`)}>Stake</GradientButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Stablecoin Vaults */}
        <section className="reveal-on-scroll mb-10">
          <h2 className="text-2xl font-extrabold text-white mb-4">USDC & USDT Vaults</h2>
          <div className="rounded-2xl border border-white/10 bg-brand-surface/70 backdrop-blur-sm overflow-hidden">
            <div className="w-full overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-brand-surface">
                  <tr className="text-white/70">
                    <th className="px-4 py-3">Protocol</th>
                    <th className="px-4 py-3">Asset</th>
                    <th
                      className="px-4 py-3 cursor-pointer select-none"
                      onClick={() => toggleSort('stable', 'apy')}
                    >
                      <SortHeader label="APY" active={stableSortKey === 'apy'} order={stableSortOrder} />
                    </th>
                    <th
                      className="px-4 py-3 cursor-pointer select-none"
                      onClick={() => toggleSort('stable', 'tvl')}
                    >
                      <SortHeader label="TVL" active={stableSortKey === 'tvl'} order={stableSortOrder} />
                    </th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingStable ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i} className="animate-pulse border-t border-white/10">
                        <td className="px-4 py-4"><div className="h-4 w-24 bg-white/10 rounded" /></td>
                        <td className="px-4 py-4"><div className="h-4 w-12 bg-white/10 rounded" /></td>
                        <td className="px-4 py-4"><div className="h-4 w-14 bg-white/10 rounded" /></td>
                        <td className="px-4 py-4"><div className="h-4 w-16 bg-white/10 rounded" /></td>
                        <td className="px-4 py-4"><div className="h-9 w-24 bg-white/10 rounded" /></td>
                      </tr>
                    ))
                  ) : (
                    sortedStable.map((row, idx) => (
                      <tr
                        key={`${row.name}-${idx}`}
                        className="border-t border-white/10 hover:bg-brand-yellow/5 transition-colors"
                      >
                        <td className="px-4 py-4 text-white font-medium">{row.name}</td>
                        <td className="px-4 py-4">
                          <span className="inline-flex items-center gap-2">
                            <TokenIcon asset={row.asset} size={18} />
                            {row.asset}
                          </span>
                        </td>
                        <td className={classNames('px-4 py-4 font-medium', getApyColor(row.apy))}>
                          {formatPercent(row.apy)}
                        </td>
                        <td className="px-4 py-4">{formatCurrencyShort(row.tvl)}</td>
                        <td className="px-4 py-3">
                          <GradientButton onClick={handleInvestClick(`${row.name} ${row.asset}`)}>Invest →</GradientButton>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* SOL Vaults */}
        <section className="reveal-on-scroll mb-10">
          <h2 className="text-2xl font-extrabold text-white mb-4">SOL Vaults</h2>
          <div className="rounded-2xl border border-white/10 bg-brand-surface/70 backdrop-blur-sm overflow-hidden">
            <div className="w-full overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-brand-surface">
                  <tr className="text-white/70">
                    <th className="px-4 py-3">Protocol</th>
                    <th className="px-4 py-3">Asset</th>
                    <th
                      className="px-4 py-3 cursor-pointer select-none"
                      onClick={() => toggleSort('sol', 'apy')}
                    >
                      <SortHeader label="APY" active={solSortKey === 'apy'} order={solSortOrder} />
                    </th>
                    <th
                      className="px-4 py-3 cursor-pointer select-none"
                      onClick={() => toggleSort('sol', 'tvl')}
                    >
                      <SortHeader label="TVL" active={solSortKey === 'tvl'} order={solSortOrder} />
                    </th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingSol ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="animate-pulse border-t border-white/10">
                        <td className="px-4 py-4"><div className="h-4 w-24 bg-white/10 rounded" /></td>
                        <td className="px-4 py-4"><div className="h-4 w-12 bg-white/10 rounded" /></td>
                        <td className="px-4 py-4"><div className="h-4 w-14 bg-white/10 rounded" /></td>
                        <td className="px-4 py-4"><div className="h-4 w-16 bg-white/10 rounded" /></td>
                        <td className="px-4 py-4"><div className="h-9 w-24 bg-white/10 rounded" /></td>
                      </tr>
                    ))
                  ) : (
                    sortedSol.map((row, idx) => (
                      <tr
                        key={`${row.name}-${idx}`}
                        className="border-t border-white/10 hover:bg-brand-yellow/5 transition-colors"
                      >
                        <td className="px-4 py-4 text-white font-medium">{row.name}</td>
                        <td className="px-4 py-4">
                          <span className="inline-flex items-center gap-2">
                            <TokenIcon asset={row.asset} size={18} />
                            {row.asset}
                          </span>
                        </td>
                        <td className={classNames('px-4 py-4 font-medium', getApyColor(row.apy))}>
                          {formatPercent(row.apy)}
                        </td>
                        <td className="px-4 py-4">{formatCurrencyShort(row.tvl)}</td>
                        <td className="px-4 py-3">
                          <GradientButton onClick={handleInvestClick(`${row.name} ${row.asset}`)}>Invest →</GradientButton>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Footer note for future integrations */}
        <footer className="reveal-on-scroll mt-12 text-center text-xs text-white/60">
          Mock data shown for demonstration. API integrations coming soon.
        </footer>
      </div>
    </div>
  );
};

export default HighYieldFixedIncome;
