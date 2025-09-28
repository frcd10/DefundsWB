"use client";

import { useWallet } from '@solana/wallet-adapter-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

interface Profile {
  wallet: string;
  name: string;
  bio?: string;
  twitter?: string;
  discord?: string;
  website?: string;
}

export default function MyAreaPage() {
  const wallet = useWallet();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<Profile>({ wallet: '', name: '', bio: '', twitter: '', discord: '', website: '' });

  useEffect(() => {
    if (wallet.publicKey) {
      const addr = wallet.publicKey.toString();
      setForm((p) => ({ ...p, wallet: addr }));
      fetch(`/api/profile?wallet=${addr}`).then(r => r.ok ? r.json() : null).then(d => {
        if (d?.success && d.data) {
          setProfile(d.data);
          setForm(d.data);
        }
      }).catch(() => {});
    }
  }, [wallet.publicKey]);

  const save = async () => {
    if (!wallet.publicKey) return;
    setSaving(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setProfile(form);
        setNotice('Profile updated');
        setTimeout(() => setNotice(null), 2500);
      } else {
        setNotice('Failed to save profile');
        setTimeout(() => setNotice(null), 2500);
      }
    } finally {
      setSaving(false);
    }
  };

  if (!wallet.connected) {
    return (
      <main className="min-h-screen bg-brand-black text-white">
        <section className="max-w-4xl mx-auto px-4 py-20 text-center">
          <h1 className="text-4xl font-extrabold mb-4">My Area</h1>
          <p className="text-white/70">Connect your wallet to manage your public profile.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-brand-black text-white">
      <section className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-extrabold mb-6">My Area</h1>
        <div className="rounded-2xl p-6 bg-white/5 backdrop-blur-sm border border-white/10">
          {notice && (
            <div className={`mb-4 px-3 py-2 rounded-lg text-sm ${notice.includes('Failed') ? 'bg-red-500/20 text-red-200 border border-red-500/40' : 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40'}`}>
              {notice}
            </div>
          )}
          <div className="grid gap-4">
            <div>
              <label className="block text-sm text-white/70 mb-1">Display Name</label>
              <input className="input w-full" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-white/70 mb-1">Bio</label>
              <textarea className="input w-full min-h-24" value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-white/70 mb-1">Twitter</label>
                <input className="input w-full" value={form.twitter}
                  onChange={(e) => setForm({ ...form, twitter: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm text-white/70 mb-1">Discord</label>
                <input className="input w-full" value={form.discord}
                  onChange={(e) => setForm({ ...form, discord: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm text-white/70 mb-1">Website</label>
                <input className="input w-full" value={form.website}
                  onChange={(e) => setForm({ ...form, website: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="block text-sm text-white/70 mb-1">Wallet</label>
              <input className="input w-full" value={form.wallet} disabled />
            </div>
            <div className="flex justify-end">
              <Button onClick={save} disabled={saving}
                className="rounded-full bg-brand-yellow text-brand-black font-semibold hover:brightness-110 transition px-6">
                {saving ? 'Saving…' : 'Save Profile'}
              </Button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
