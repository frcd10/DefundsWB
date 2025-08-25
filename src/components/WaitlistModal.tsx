/* ------------------------------------------------------------------
   /src/app/components/WaitlistModal.tsx
   A lightweight dialog that posts e-mail + role to /api/waitlist
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

export default function WaitlistModal({ forRole, onClose }: Props) {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function join() {
    setSubmitting(true);
    await fetch('/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, role: forRole }),
    });
    setSubmitting(false);
    setDone(true);
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          {done
            ? `🎉 Welcome to the ${forRole} waitlist!`
            : `Join as a ${forRole}`}
        </DialogHeader>

        {done ? (
          <p className="py-6 text-center">
            We’ll keep you posted with early-access details.
          </p>
        ) : (
          <>
            <Input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
            />
            <Button className="mt-4 w-full" onClick={join} disabled={submitting || !email}>
              {submitting ? 'Adding…' : 'Add to Waitlist'}
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
