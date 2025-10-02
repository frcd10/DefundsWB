/* ------------------------------------------------------------------
   /src/components/WaitlistModal.tsx
  A lightweight dialog that posts whitelist info to /whitelist
   ------------------------------------------------------------------ */
'use client';

import { Dialog, DialogContent, DialogHeader } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useState } from 'react';

interface Props {
  forRole: 'trader' | 'investor';
  onClose: () => void;
}

//testing
export default function WaitlistModal({ forRole, onClose }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [wallet, setWallet] = useState('');
  const [phone, setPhone] = useState('');
  const [twitter, setTwitter] = useState('');
  const [discord, setDiscord] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function join() {
    setSubmitting(true);
    setError(''); // Clear previous errors
    setDone(false); // Ensure done is false when starting
    
    try {
      // Submit to new whitelist endpoint with expanded fields
      const response = await fetch('/whitelist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          wallet: wallet.trim(),
          phone: phone.trim() || undefined,
          twitter: twitter.trim() || undefined,
          discord: discord.trim() || undefined,
          role: forRole,
        }),
      });

      const data = await response.json();
      
      console.log('API Response:', { status: response.status, data }); // Debug log

      if (response.ok && data.success) {
        console.log('Success - setting done to true');
        setDone(true);
        setError(''); // Ensure no error state
      } else {
        console.log('Error response - setting error message');
        setDone(false); // Ensure done stays false
        
        // Handle different types of errors with specific messages
        if (response.status === 429) {
          setError(data.error || 'Too many attempts. Please try again later.');
        } else if (response.status === 409) {
          setError('This email is already registered on our waitlist.');
        } else if (response.status === 400) {
          setError(data.error || 'Please check required fields.');
        } else {
          setError(data.error || 'Something went wrong. Please try again later.');
        }
      }
    } catch (err) {
      console.error('Network error:', err);
      setDone(false); // Ensure done stays false
      setError('Network error. Please check your connection and try again.');
    }
    
    setSubmitting(false);
  }

  // Add debug logging for state changes
  console.log('Current state:', { done, error: !!error, submitting });

  const roleLabel = forRole === 'trader' ? 'Traders/RWA Ops' : 'Investor';

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-sol-800/90 border border-sol-700 text-sol-50">
        <DialogHeader>
          {done && !error
            ? `🎉 Welcome to the ${roleLabel} waitlist!`
            : `Join as ${roleLabel}`}
        </DialogHeader>

        {done && !error ? (
          <div className="py-6 text-center space-y-4">
            <div className="mx-auto max-w-sm rounded-xl bg-sol-800/60 border border-sol-700 p-4">
              <p className="text-sol-200">
                Thanks, please check your email to verify.
              </p>
            </div>
            <Button onClick={onClose} className="w-full rounded-xl bg-gradient-to-r from-sol-accent to-cyan-400 text-sol-900 font-semibold hover:scale-105 transition">
              Close
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-3">
              <Input
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={submitting}
                className={`input w-full ${error && !name.trim() ? 'border-red-400' : ''}`}
              />
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
                className={`input w-full ${error && !email.trim() ? 'border-red-400' : ''}`}
              />
              <Input
                type="text"
                placeholder="Wallet (Solana / ETH)"
                value={wallet}
                onChange={(e) => setWallet(e.target.value)}
                disabled={submitting}
                className={`input w-full ${error && !wallet.trim() ? 'border-red-400' : ''}`}
              />

              {/* Optional fields */}
              <Input
                type="text"
                placeholder="Phone (optional)"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={submitting}
                className="input w-full"
              />
              <Input
                type="text"
                placeholder="Twitter (optional)"
                value={twitter}
                onChange={(e) => setTwitter(e.target.value)}
                disabled={submitting}
                className="input w-full"
              />
              <Input
                type="text"
                placeholder="Discord (optional)"
                value={discord}
                onChange={(e) => setDiscord(e.target.value)}
                disabled={submitting}
                className="input w-full"
              />

              {error && (
                <div className="mt-2 p-3 bg-red-900/30 border border-red-700 rounded-lg">
                  <p className="text-red-300 text-sm font-medium">{error}</p>
                </div>
              )}
            </div>
            
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={onClose} 
                disabled={submitting}
                className="flex-1 rounded-xl border-sol-600 text-sol-100"
              >
                Cancel
              </Button>
              <Button 
                onClick={join}
                disabled={submitting || !name.trim() || !email.trim() || !wallet.trim()}
                className="flex-1 rounded-xl bg-gradient-to-r from-sol-accent to-cyan-400 text-sol-900 font-semibold hover:scale-105 transition"
              >
                {submitting ? 'Adding…' : 'Join Waitlist'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
