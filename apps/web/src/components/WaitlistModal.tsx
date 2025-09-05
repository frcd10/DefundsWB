/* ------------------------------------------------------------------
   /src/components/WaitlistModal.tsx
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
  const [error, setError] = useState('');

  async function join() {
    setSubmitting(true);
    setError(''); // Clear previous errors
    setDone(false); // Ensure done is false when starting
    
    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role: forRole }),
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
          setError(data.error || 'Please enter a valid email address.');
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

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          {done && !error
            ? `🎉 Welcome to the ${forRole} waitlist!`
            : `Join as a ${forRole}`}
        </DialogHeader>

        {done && !error ? (
          <div className="py-6 text-center space-y-4">
            <p className="text-sol-200">
              We&apos;ll keep you posted with early-access details.
            </p>
            <Button onClick={onClose} className="w-full">
              Close
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
                className={error ? 'border-red-400 focus:border-red-400 focus:ring-red-400' : ''}
              />
              {error && (
                <div className="mt-2 p-3 bg-red-900/20 border border-red-400/50 rounded-lg">
                  <p className="text-red-400 text-sm font-medium">{error}</p>
                </div>
              )}
            </div>
            
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={onClose} 
                disabled={submitting}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button 
                onClick={join} 
                disabled={submitting || !email.trim()}
                className="flex-1"
              >
                {submitting ? 'Adding…' : 'Add to Waitlist'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
