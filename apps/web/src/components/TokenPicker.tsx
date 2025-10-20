'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { getTokenList, TokenInfo } from '@/data/tokenlist';

export function TokenPicker({ value, onChange }: { value: string; onChange: (mint: string) => void }) {
  const [q, setQ] = useState('');
  const tokens = useMemo(() => getTokenList(), []);
  const display = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return tokens;
    return tokens.filter(t => t.symbol.toLowerCase().includes(query) || t.name.toLowerCase().includes(query) || t.mint.toLowerCase().includes(query));
  }, [q, tokens]);

  const current = tokens.find(t => t.mint === value);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {current?.logoURI && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current.logoURI} alt={current.symbol} className="w-6 h-6 rounded-full" />
        )}
        <Input placeholder="Search token or paste mint" value={q} onChange={(e) => setQ(e.target.value)} className="input" />
      </div>
      <div className="max-h-56 overflow-auto rounded-xl border border-white/10">
        {display.map((t) => (
          <button key={t.mint} type="button" className={`w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-white/5 ${t.mint===value?'bg-white/5':''}`} onClick={() => onChange(t.mint)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {t.logoURI ? <img src={t.logoURI} alt={t.symbol} className="w-5 h-5 rounded-full" /> : <div className="w-5 h-5 rounded-full bg-white/10" />}
            <div className="flex-1">
              <div className="text-sm text-white">{t.symbol}</div>
              <div className="text-[10px] text-white/40">{t.mint.slice(0,6)}...{t.mint.slice(-6)}</div>
            </div>
            <div className="text-[10px] text-white/40">{t.decimals} dp</div>
          </button>
        ))}
      </div>
    </div>
  );
}
