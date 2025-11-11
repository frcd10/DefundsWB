'use client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useState } from 'react';

interface PitchDeckModalProps { open: boolean; onClose: () => void; }

const weeks = [
  { week: 'Week 1', progress: 'October 2', summary: 'https://www.youtube.com/watch?v=aucL3IrktPo' },
  { week: 'Week 2', progress: 'October 9', summary: 'https://www.youtube.com/watch?v=On6Ki4A35ss' },
  { week: 'Week 3', progress: 'October 16', summary: 'https://youtu.be/BWpdo1xu4eY' },
  { week: 'Week 4', progress: 'October 16', summary: 'https://youtu.be/L4K4C1fxdZU' },
];

export function PitchDeckModal({ open, onClose }: PitchDeckModalProps) {
  const [tab, setTab] = useState<'updates' | 'deck'>('updates');
  if (!open) return null;
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[680px] bg-[#0B0B0C] text-white border border-white/10 rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_8px_40px_-4px_rgba(0,0,0,0.65)] p-0 overflow-hidden">
        <div className="h-1 w-full bg-gradient-to-r from-brand-yellow via-brand-yellow/60 to-transparent" />
        <div className="px-6 pt-6 pb-3 flex flex-col gap-3">
          <DialogHeader>
            <DialogTitle className="text-2xl font-extrabold">Pitch Deck & Progress</DialogTitle>
            <DialogDescription className="text-white/70">Weekly build transparency + full vision deck.</DialogDescription>
          </DialogHeader>
          <div className="text-[11px] leading-relaxed text-white/50 bg-white/5 border border-white/10 rounded-lg px-4 py-3">
            Updates are posted weekly. The complete pitch deck will be uploaded at the end of the Cypherpunk hackathon. Early investors can follow iteration here meanwhile.
          </div>
          <div className="flex gap-2 mt-2">
            <button onClick={() => setTab('updates')} className={`px-4 py-2 rounded-full text-sm font-medium transition border ${tab==='updates' ? 'bg-brand-yellow text-brand-black border-brand-yellow' : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10'}`}>Weekly Updates</button>
            <button onClick={() => setTab('deck')} className={`px-4 py-2 rounded-full text-sm font-medium transition border ${tab==='deck' ? 'bg-brand-yellow text-brand-black border-brand-yellow' : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10'}`}>Full Pitch</button>
          </div>
        </div>
        <div className="px-6 pb-7 space-y-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {tab === 'updates' && (
            <div className="space-y-5">
              {weeks.map(w => (
                <div key={w.week} className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-semibold text-white">{w.week}</h3>
                    <span className="text-xs px-2 py-1 rounded-full bg-brand-yellow/15 text-brand-yellow border border-brand-yellow/30">{w.progress}</span>
                  </div>
                  {typeof w.summary === 'string' && w.summary.startsWith('http') ? (
                    <a
                      href={w.summary}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-brand-yellow hover:underline break-words"
                    >
                      {w.summary}
                    </a>
                  ) : (
                    <p className="text-sm text-white/70 leading-relaxed">{w.summary}</p>
                  )}
                </div>
              ))}
            </div>
          )}
          {tab === 'deck' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Vision & Strategy (Preview)</h3>
              <ul className="list-disc list-inside text-sm text-white/70 space-y-1">
                <li>Institutional‑grade decentralized asset management OS</li>
                <li>Composable fund primitives & RWA rails (multi‑jurisdiction)</li>
                <li>Performance & risk transparency as protocol-native features</li>
                <li>Incentive layer aligning managers, investors, and governance</li>
                <li>Progressive decentralization & compliance bridging</li>
              </ul>
              <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                <div className="text-sm text-white/70 mb-2">Full Pitch (Video)</div>
                <a
                  href="https://www.youtube.com/watch?v=xuU26R39dNo"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-brand-yellow hover:underline break-words"
                >
                  Watch on YouTube
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path fillRule="evenodd" d="M5 10a1 1 0 011-1h5.586L9.293 6.707a1 1 0 111.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 11-1.414-1.414L11.586 11H6a1 1 0 01-1-1z" clipRule="evenodd" />
                  </svg>
                </a>
              </div>
              <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                <div className="text-sm text-white/70 mb-2">Colosseum Cypherpunk</div>
                <a
                  href="https://arena.colosseum.org/projects/explore/defunds-finance"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-brand-yellow hover:underline break-words"
                >
                  View project on Colosseum
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path fillRule="evenodd" d="M5 10a1 1 0 011-1h5.586L9.293 6.707a1 1 0 111.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 11-1.414-1.414L11.586 11H6a1 1 0 01-1-1z" clipRule="evenodd" />
                  </svg>
                </a>
              </div>
            </div>
          )}
          <div className="flex justify-end pt-2">
            <button onClick={onClose} className="inline-flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/15 text-sm font-medium h-11 px-6 transition">Close</button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
