'use client';

import React from 'react';

type Status = 'done' | 'in-progress' | 'planned';

interface RoadmapEntry {
  id: number;
  quarter: string; // e.g., 'Q3 2025'
  label?: string;  // optional short label like 'Oct 2025'
  status: Status;
  items: string[]; // bullet points
}

// Edit this array to add/remove roadmap pins
const roadmap: RoadmapEntry[] = [
  {
    id: 1,
    quarter: 'Q4 2025',
    label: 'Oct-Dec 2025',
    status: 'in-progress',
    items: [
      'Cypherpunk hackathon participation (DeFi)',
      'Initial brand identity & institutional theme',
      'Mainnet Rust program deploy with limits per user',
      'Reach 1.000 Users',
      'Reach 5.000 Followers on X',
      'Public roadmap & investor updates',
    ],
  },
  {
    id: 2,
    quarter: 'Q1 2026',
    label: 'Jan–Mar 2026',
    status: 'planned',
    items: [
      'RWA rails preview & compliance research',
      'External audit (target: Q1 2026)',
      'Open Mainnet Rust program (no limits)',
      'Manager onboarding & fund templates',
      'Program-level NAV transparency upgrades',
    ],
  },
    {
    id: 3,
    quarter: 'Q2 2026',
    label: 'Abr–Jun 2026',
    status: 'planned',
    items: [
      'Bring web2 fund managers on-chain',
    ],
  },
];

function StatusBadge({ status }: { status: Status }) {
  const map: Record<Status, { text: string; cls: string }> = {
    'done': { text: 'Done', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
    'in-progress': { text: 'In Progress', cls: 'bg-brand-yellow/15 text-brand-yellow border-brand-yellow/30' },
    'planned': { text: 'Planned', cls: 'bg-white/10 text-white/70 border-white/20' },
  };
  const s = map[status];
  return (
    <span className={`text-xs px-2 py-1 rounded-full border ${s.cls}`}>{s.text}</span>
  );
}

export default function RoadmapPage() {
  return (
    <main className="min-h-screen bg-brand-black text-white pb-24">
      {/* Header */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 sm:pt-12">
        <div className="text-center sm:text-left mb-10">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold mb-3">
            Product <span className="text-brand-yellow">Roadmap</span>
          </h1>
          <p className="text-white/70 max-w-2xl text-sm sm:text-base">
            Transparent milestones across DeFi and RWA.
          </p>
        </div>

        {/* Timeline */}
        <div className="relative">
          <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-px bg-white/10" aria-hidden />
          <div className="space-y-8">
            {roadmap.map((entry, idx) => (
              <div key={entry.id} className={`flex flex-col ${idx % 2 === 0 ? 'sm:flex-row' : 'sm:flex-row-reverse'} items-stretch gap-6`}>
                {/* Side A: Card */}
                <div className="sm:w-1/2">
                  <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-5 h-full">
                    <div className="flex items-center justify-between mb-2">
                      <h2 className="text-lg sm:text-xl font-semibold">{entry.quarter}</h2>
                      <StatusBadge status={entry.status} />
                    </div>
                    {entry.label && (
                      <div className="text-xs text-white/50 mb-3">{entry.label}</div>
                    )}
                    <ul className="list-disc list-inside space-y-2 text-sm text-white/70">
                      {entry.items.map((it, i) => (
                        <li key={i}>{it}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                {/* Center dot */}
                <div className="hidden sm:flex items-center justify-center w-0">
                  <div className={`w-3 h-3 rounded-full border-2 ${
                    entry.status === 'done' ? 'bg-emerald-400 border-emerald-500' :
                    entry.status === 'in-progress' ? 'bg-brand-yellow border-brand-yellow' :
                    'bg-white/50 border-white/60'
                  }`} />
                </div>
                {/* Side B: Spacer */}
                <div className="hidden sm:block sm:w-1/2" />
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
