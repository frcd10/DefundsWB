"use client";

import { useWallet } from '@solana/wallet-adapter-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { COUNTRIES } from '@/lib/countries';

interface Profile {
  wallet: string;
  name: string;
  bio?: string;
  twitter?: string;
  discord?: string;
  website?: string;
  // private
  email?: string;
  phone?: string;
  country?: string;
}

type Referrals = { referralCode: string | null; inviteCodes: string[]; invitedUsers: number; invitedList: string[]; points: number; totalInvested: number; referredBy: string | null };

export default function MyAreaPage() {
  const wallet = useWallet();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<Profile>({ wallet: '', name: '', bio: '', twitter: '', discord: '', website: '', email: '', phone: '', country: '' });
  const [referrals, setReferrals] = useState<Referrals | null>(null);
  const [rotating, setRotating] = useState(false);
  const [desiredCode, setDesiredCode] = useState('');

  useEffect(() => {
    if (wallet.publicKey) {
      const addr = wallet.publicKey.toString();
      setForm((p) => ({ ...p, wallet: addr }));
      fetch(`/api/profile?wallet=${addr}`).then(r => r.ok ? r.json() : null).then(d => {
        if (d?.success && d.data) {
          setProfile(d.data);
          const priv = d.data.privateProfile || {};
          setForm(prev => ({ ...prev, wallet: addr, name: d.data.name || prev.name, bio: d.data.bio || '', twitter: d.data.twitter || '', discord: d.data.discord || '', website: d.data.website || '', email: priv.email || '', phone: priv.phone || '', country: priv.country || '' }));
        }
      }).catch(() => {});
      fetch(`/api/referrals?wallet=${addr}`).then(r => r.ok ? r.json() : null).then(d => { if (d?.success) setReferrals(d.data); }).catch(() => {});
    }
  }, [wallet.publicKey]);

  const save = async () => {
    if (!wallet.publicKey) return;
    setSaving(true);
    try {
      const res = await fetch('/api/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wallet: form.wallet, name: form.name, bio: form.bio, twitter: form.twitter, discord: form.discord, website: form.website, privateProfile: { email: form.email, phone: form.phone || undefined, country: form.country || undefined } }) });
      const data = await res.json();
      if (res.ok && data.success) { setProfile(form); setNotice('Profile updated'); setTimeout(() => setNotice(null), 2500); } else { setNotice('Failed to save profile'); setTimeout(() => setNotice(null), 2500); }
    } finally { setSaving(false); }
  };

  const rotateReferral = async () => {
    if (!wallet.publicKey) return;
    const code = desiredCode.trim();
    if (!code) { setNotice('Enter a referral code to set'); setTimeout(() => setNotice(null), 2500); return; }
    setRotating(true);
    try {
      const res = await fetch('/api/referrals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wallet: wallet.publicKey.toString(), desiredCode: code }) });
      const data = await res.json();
      if (res.ok && data.success) {
        setReferrals((r) => r ? { ...r, referralCode: data.data.referralCode, inviteCodes: Array.from(new Set([data.data.referralCode, ...r.inviteCodes])) } : { referralCode: data.data.referralCode, inviteCodes: [data.data.referralCode], invitedUsers: 0, invitedList: [], points: 0, totalInvested: 0, referredBy: null });
        setDesiredCode('');
        setNotice('Referral code updated');
        setTimeout(() => setNotice(null), 2500);
      } else {
        setNotice(data?.error || 'Failed to update referral code');
        setTimeout(() => setNotice(null), 2500);
      }
    } finally { setRotating(false); }
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
        <div className="rounded-2xl p-6 space-y-8 bg-white/5 backdrop-blur-sm border border-white/10">
          {notice && (
            <div className={`mb-4 px-3 py-2 rounded-lg text-sm ${notice.includes('Failed') ? 'bg-red-500/20 text-red-200 border border-red-500/40' : 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40'}`}>
              {notice}
            </div>
          )}
          <div className="grid gap-6">
            {/* Referral section */}
            <div className="rounded-xl border border-white/10 p-4 bg-black/30">
              <h2 className="text-lg font-semibold text-white mb-2">Your Referral</h2>
              <p className="text-xs text-white/60 mb-4">Share your code so friends can be attributed to you.</p>
              <div className="flex items-center gap-2 mb-3">
                <input className="w-full rounded-lg bg-white/5 border border-white/15 px-3 py-2 text-sm text-white font-mono tracking-wider" readOnly value={referrals?.referralCode || ''} />
                <Button onClick={() => referrals?.referralCode && navigator.clipboard.writeText(referrals.referralCode)} className="rounded-lg bg-brand-yellow text-brand-black">Copy</Button>
              </div>
              <div className="text-xs text-white/60">Invited users: <span className="text-white">{referrals?.invitedUsers ?? 0}</span></div>
              {referrals?.referredBy && (<div className="text-xs text-white/60 mt-1">Referred by: <span className="text-white">{referrals.referredBy}</span></div>)}
              <div className="flex items-center gap-2 mt-4">
                <input
                  className="input w-full"
                  value={desiredCode}
                  onChange={(e) => setDesiredCode(e.target.value)}
                  placeholder="Enter new referral code"
                />
                <Button onClick={rotateReferral} disabled={rotating} className="rounded-lg bg-white/10 border border-white/15 text-white">{rotating ? 'Changing…' : 'Change'}</Button>
              </div>
            </div>

            {/* Profile sections (existing) */}
            <div>
              <h2 className="text-lg font-semibold text-white mb-2">Public Profile</h2>
              <p className="text-xs text-white/50 mb-4">Visible to other users and investors.</p>
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
              </div>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white mb-2">Private Profile</h2>
              <p className="text-xs text-white/50 mb-4">Not publicly visible. Used for future compliance or notifications.</p>
              <div className="grid gap-4">
                <div>
                  <label className="block text-sm text-white/70 mb-1">Email <span className="text-red-400"></span></label>
                  <input className="input w-full" type="email" value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" />
                </div>
                <div>
                  <label className="block text-sm text-white/70 mb-1">Phone (optional)</label>
                  <input className="input w-full" value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+1 555 123 4567" />
                </div>
                <div>
                  <label className="block text-sm text-white/70 mb-1">Country</label>
                  <div className="relative">
                    <select
                      className="w-full appearance-none rounded-lg bg-white/5 border border-white/15 focus:border-brand-yellow/60 focus:ring-0 text-sm text-white px-3 py-2 pr-9 [color-scheme:dark]"
                      value={form.country}
                      onChange={(e) => setForm({ ...form, country: e.target.value })}
                    >
                      <option className="bg-[#0B0B0C]" value="">Select country</option>
                      {COUNTRIES.map(c => (
                        <option className="bg-[#0B0B0C]" key={c.code} value={c.code}>{c.name}</option>
                      ))}
                    </select>
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/50 text-[10px] tracking-wider">▼</span>
                  </div>
                </div>
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
