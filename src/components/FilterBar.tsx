'use client';

import { FundType } from '@/data/mockFunds';
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
    <div className="flex flex-wrap gap-4 bg-sol-800/40 p-4 rounded-xl mb-10">
      {/* Search ---------------------------------------------------------- */}
      <div>
        <label className="text-sol-100 text-sm">Trader / Fund</label>
        <input
          type="text"
          placeholder="search"
          className="input w-40"
          onChange={(e) => update({ query: e.target.value || undefined })}
        />
      </div>

      {/* Max perf-fee % -------------------------------------------------- */}
      <div>
        <label className="text-sol-100 text-sm">Max perf-fee %</label>
        <input
          type="number"
          className="input w-24"
          onChange={(e) =>
            update({ maxPerfFee: Number(e.target.value) || undefined })
          }
        />
      </div>

      {/* Max cap -------------------------------------------------------- */}
      <div>
        <label className="text-sol-100 text-sm">Max cap (SOL)</label>
        <input
          type="number"
          className="input w-28"
          onChange={(e) => update({ maxCap: Number(e.target.value) || undefined })}
        />
      </div>

      {/* Type selector --------------------------------------------------- */}
      <div>
        <label className="text-sol-100 text-sm">Type</label>
        <select
          className="input"
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
