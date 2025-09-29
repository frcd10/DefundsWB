"use client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { formatSol } from '@/lib/formatters';

interface PublicProfileModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profile?: {
    wallet: string;
    name?: string;
    bio?: string;
    twitter?: string;
    discord?: string;
    website?: string;
    stats?: { products: number; avgReturnPct: number };
    openItems?: { id: string; name: string; type: string }[];
  };
}

export function PublicProfileModal({ open, onOpenChange, profile }: PublicProfileModalProps) {
  const display = profile;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] bg-[#0B0B0C] text-white border border-white/10 rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_8px_40px_-4px_rgba(0,0,0,0.65)] p-0 overflow-hidden">
        <div className="h-1 w-full bg-gradient-to-r from-brand-yellow via-brand-yellow/60 to-transparent" />
        <div className="px-6 pt-6 pb-4">
          <DialogHeader>
            <DialogTitle className="text-2xl font-extrabold text-white">
              {display?.name || 'Public Profile'}
            </DialogTitle>
            <DialogDescription className="text-white/70">On-chain fund / product operator information</DialogDescription>
          </DialogHeader>
        </div>
        <div className="px-6 pb-6 space-y-5">
          <div className="text-sm text-white/70 break-words">
            <p className="font-mono text-xs text-white/50 mb-2">{display?.wallet}</p>
            {display?.bio && <p className="leading-relaxed text-white/80">{display.bio}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4 text-xs text-white/70">
            <div className="bg-white/5 rounded-lg p-3 border border-white/10">
              <p className="text-[10px] uppercase tracking-wide text-white/40 mb-1">Products</p>
              <p className="text-white font-semibold text-sm">{display?.stats?.products ?? 0}</p>
            </div>
            <div className="bg-white/5 rounded-lg p-3 border border-white/10">
              <p className="text-[10px] uppercase tracking-wide text-white/40 mb-1">Avg Return %</p>
              <p className="text-white font-semibold text-sm">{display?.stats ? display.stats.avgReturnPct.toFixed(2) : '0.00'}%</p>
            </div>
          </div>
          {(display?.twitter || display?.discord || display?.website) && (
            <div className="text-xs text-white/70 space-y-1">
              {display.twitter && <p><span className="text-white/40">Twitter:</span> @{display.twitter}</p>}
              {display.discord && <p><span className="text-white/40">Discord:</span> {display.discord}</p>}
              {display.website && <p><span className="text-white/40">Website:</span> <a href={display.website.startsWith('http') ? display.website : `https://${display.website}`} target="_blank" className="text-brand-yellow hover:underline">{display.website}</a></p>}
            </div>
          )}
          {display?.openItems && display.openItems.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-white mb-2">Open Public Products</h4>
              <ul className="space-y-1">
                {display.openItems.map(i => (
                  <li key={i.id} className="text-xs text-white/70 flex items-center justify-between bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                    <span className="truncate pr-2">{i.name}</span>
                    <span className="text-white/40 text-[10px] uppercase tracking-wide">{i.type}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
