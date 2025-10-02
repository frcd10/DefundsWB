"use client";
import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';

interface CodeEntry { code: string; used?: boolean }
interface FundWithAccess { fundId: string; name?: string; access?: { type: string; codes?: CodeEntry[]; code?: string }; accessMode?: string }

export function FundAccessCodesPanel({ fund }: { fund: FundWithAccess }) {
  const codes = fund.access?.type === 'multi_code' ? (fund.access?.codes || []) : [];
  const single = fund.access?.type === 'single_code' ? fund.access?.code : null;
  const [filter, setFilter] = useState<'all' | 'unused'>('all');
  const list = useMemo(() => {
    const base = codes;
    if (filter === 'unused') return base.filter(c => !c.used);
    return base;
  }, [codes, filter]);

  const copyCodes = (onlyUnused = false) => {
    const arr = onlyUnused ? codes.filter(c => !c.used) : codes;
    if (single && !codes.length) arr.push({ code: single, used: false });
    navigator.clipboard.writeText(arr.map(c => c.code).join('\n'));
  };

  const download = () => {
    const arr = single && !codes.length ? [single] : codes.map(c => c.code);
    const blob = new Blob([arr.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `fund_${fund.fundId}_codes.txt`; a.click();
    URL.revokeObjectURL(url);
  };

  if (!fund.access) return <div className="text-sm text-white/50">No access restrictions.</div>;
  if (fund.access.type === 'public') return <div className="text-sm text-white/60">Public fund – no codes.</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-semibold text-white">Access Codes</h3>
        {fund.access.type === 'single_code' && single && (
          <span className="px-2 py-1 rounded bg-white/10 border border-white/15 text-xs font-mono tracking-wider">{single}</span>
        )}
        {fund.access.type === 'multi_code' && (
          <>
            <span className="text-xs text-white/50">Total: {codes.length}</span>
            <span className="text-xs text-emerald-400">Unused: {codes.filter(c => !c.used).length}</span>
            <span className="text-xs text-white/40">Used: {codes.filter(c => c.used).length}</span>
            <div className="flex gap-2 ml-auto">
              <Button onClick={() => copyCodes(false)} className="rounded-full bg-brand-yellow text-brand-black text-xs font-semibold px-4 py-2">Copy All</Button>
              <Button onClick={() => copyCodes(true)} className="rounded-full bg-white/10 border border-white/15 text-xs font-semibold px-4 py-2 hover:bg-white/15">Copy Unused</Button>
              <Button onClick={download} className="rounded-full bg-white/10 border border-white/15 text-xs font-semibold px-4 py-2 hover:bg-white/15">Download</Button>
            </div>
          </>
        )}
      </div>
      {fund.access.type === 'multi_code' && (
        <div>
          <div className="flex items-center gap-3 mb-2 text-xs">
            <button onClick={() => setFilter('all')} className={`px-3 py-1 rounded-full border ${filter==='all' ? 'bg-brand-yellow text-brand-black border-brand-yellow' : 'bg-white/5 text-white/60 border-white/10 hover:text-white'}`}>All</button>
            <button onClick={() => setFilter('unused')} className={`px-3 py-1 rounded-full border ${filter==='unused' ? 'bg-brand-yellow text-brand-black border-brand-yellow' : 'bg-white/5 text-white/60 border-white/10 hover:text-white'}`}>Unused</button>
          </div>
          <div className="max-h-64 overflow-auto grid grid-cols-3 gap-2 text-[11px] font-mono">
            {list.map(c => (
              <div key={c.code} className={`px-2 py-1 rounded text-center tracking-wider ${c.used ? 'bg-white/5 text-white/40 line-through' : 'bg-white/10 text-white'}`}>{c.code}</div>
            ))}
            {list.length === 0 && <div className="col-span-3 text-xs text-white/40 py-4 text-center">No codes match filter.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
