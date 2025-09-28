'use client';

import { FundType } from '@/types/fund';
import { useState } from 'react';

export interface Filters {
  query?: string;        // NEW
  maxPerfFee?: number;
  maxCap?: number;
  type?: FundType;
}

export default function FilterBar({ onChange }: { onChange: (f: Filters) => void }) {
  const [filters, setFilters] = useState<Filters>({});

  const update = (partial: Partial<Filters>) => {
    const next = { ...filters, ...partial };
    setFilters(next);
    onChange(next);
  };

  return (
    <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4 bg-white/5 backdrop-blur-sm border border-white/10 p-4 rounded-2xl mb-10">
      {/* Search ---------------------------------------------------------- */}
      <div className="flex-1 min-w-[200px] sm:min-w-0 sm:flex-none">
  <label className="block text-white/70 text-sm mb-1">Trader / Fund</label>
        <input
          type="text"
          placeholder="search"
          className="input w-full sm:w-40"
          onChange={(e) => update({ query: e.target.value || undefined })}
        />
      </div>

      {/* Max perf-fee % -------------------------------------------------- */}
      <div className="flex-1 min-w-[120px] sm:min-w-0 sm:flex-none">
  <label className="block text-white/70 text-sm mb-1">Max perf-fee %</label>
        <input
          type="number"
          className="input w-full sm:w-24"
          onChange={(e) =>
            update({ maxPerfFee: Number(e.target.value) || undefined })
          }
        />
      </div>

      {/* Max cap -------------------------------------------------------- */}
      <div className="flex-1 min-w-[140px] sm:min-w-0 sm:flex-none">
  <label className="block text-white/70 text-sm mb-1">Max cap (SOL)</label>
        <input
          type="number"
          className="input w-full sm:w-28"
          onChange={(e) => update({ maxCap: Number(e.target.value) || undefined })}
        />
      </div>

      {/* Type selector --------------------------------------------------- */}
      <div className="flex-1 min-w-[160px] sm:min-w-0 sm:flex-none">
  <label className="block text-white/70 text-sm mb-1">Type</label>
        <select
          className="input w-full"
          defaultValue=""
          onChange={(e) =>
            update({ type: (e.target.value as FundType) || undefined })
          }
        >
          <option value="">Any</option>
          <option>Memes</option>
          <option>Arbitrage</option>
          <option>Leverage Futures</option>
          <option>Yield Farming</option>
          <option>Long Biased</option>
          <option>Long Only</option>
          <option>Sniper</option>
          <option>Quantitative</option>
          <option>BTC only</option>
          <option>ETH only</option>
          <option>SOL only</option>
          <option>BIG 3 only</option>
          <option>FREE</option>
          <option>On Chain Stocks Only</option>
        </select>
      </div>
    </div>
  );
}
