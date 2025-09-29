'use client';
import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

interface SubscribeFormProps {
  className?: string;
}

export function SubscribeForm({ className = '' }: SubscribeFormProps) {
  const wallet = useWallet();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const canSubmit = wallet.connected && email.length > 3 && status !== 'submitting';

  async function handleSubscribe(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet.connected || !wallet.publicKey) {
      setError('Connect your wallet to subscribe');
      return;
    }
    setStatus('submitting');
    setError(null);
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: wallet.publicKey.toString(), email }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Subscription failed');
      setStatus('success');
    } catch (e: any) {
      setStatus('error');
      setError(e?.message || 'Subscription failed');
    }
  }

  return (
    <form onSubmit={handleSubscribe} className={`flex flex-col gap-4 ${className}`}>
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center max-w-md mx-auto w-full">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter your email"
          className="input flex-1 rounded-full"
          disabled={status === 'submitting' || status === 'success'}
          required
        />
        {!wallet.connected ? (
          <div className="flex justify-center sm:w-auto">
            <WalletMultiButton className="!rounded-full !bg-brand-yellow !text-brand-black !font-semibold !px-6 !py-3 hover:!brightness-110" />
          </div>
        ) : (
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-full bg-brand-yellow text-brand-black hover:brightness-110 font-semibold py-3 sm:py-2 min-h-[44px] px-8 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === 'submitting' ? 'Subscribing...' : status === 'success' ? 'Subscribed' : 'Subscribe'}
          </button>
        )}
      </div>
      {error && <p className="text-center text-sm text-red-400">{error}</p>}
      {status === 'success' && <p className="text-center text-sm text-brand-yellow/80">Subscription saved ✅</p>}
    </form>
  );
}
