"use client";

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface Profile {
  wallet: string;
  name: string;
  bio?: string;
  twitter?: string;
  discord?: string;
  website?: string;
  stats?: {
    products: number;
    avgReturnPct: number;
  }
  openItems?: Array<{ id: string; name: string; type: string; }>
}

export default function PublicProfilePage() {
  const params = useParams<{ wallet: string }>();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    if (params?.wallet) {
      fetch(`/api/profile?wallet=${params.wallet}`).then(r => r.ok ? r.json() : null).then(d => {
        if (d?.success && d.data) {
          setProfile(d.data);
        }
      }).catch(() => {});
    }
  }, [params?.wallet]);

  if (!profile) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-sol-900 via-sol-850 to-sol-800 text-white">
        <section className="max-w-4xl mx-auto px-4 py-20 text-center">Loading…</section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-sol-900 via-sol-850 to-sol-800 text-white">
      <section className="max-w-5xl mx-auto px-4 py-12">
        <div className="rounded-2xl p-6 bg-sol-800/60 backdrop-blur border border-sol-700">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-extrabold text-sol-50">{profile.name || 'Unnamed'}</h1>
              <p className="text-sol-300 text-sm break-all">{profile.wallet}</p>
            </div>
            <div className="text-right">
              <p className="text-sol-200 text-sm">Products: <span className="font-semibold">{profile.stats?.products ?? 0}</span></p>
              <p className="text-sol-200 text-sm">Avg Return: <span className="font-semibold">{(profile.stats?.avgReturnPct ?? 0).toFixed(2)}%</span></p>
            </div>
          </div>
          {profile.bio && (
            <p className="mt-4 text-sol-200">{profile.bio}</p>
          )}
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            {profile.twitter && (<a className="text-sol-accent hover:underline" href={`https://twitter.com/${profile.twitter.replace('@','')}`} target="_blank">Twitter</a>)}
            {profile.discord && (<span className="text-sol-300">Discord: {profile.discord}</span>)}
            {profile.website && (<a className="text-sol-accent hover:underline" href={profile.website} target="_blank">Website</a>)}
          </div>
        </div>

        <div className="mt-8 rounded-2xl p-6 bg-sol-800/60 backdrop-blur border border-sol-700">
          <h2 className="text-xl font-bold text-sol-50 mb-4">Open Items</h2>
          {profile.openItems?.length ? (
            <ul className="space-y-2">
              {profile.openItems.map((it) => (
                <li key={it.id} className="flex justify-between text-sol-200">
                  <span>{it.name}</span>
                  <span className="text-sol-300">{it.type}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sol-300">Nothing open at the moment.</p>
          )}
        </div>
      </section>
    </main>
  );
}
