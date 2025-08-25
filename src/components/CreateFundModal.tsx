'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

const schema = z.object({
  fundName: z.string().min(3),
  type: z.enum(['Memes', 'Arbitrage', 'Leverage Futures', 'Yield Farming']),
  perfFee: z.number().int().min(0).max(50),
  minTicket: z.number().min(0.1),
  maxTicket: z.number().min(0.1),
  collectiveCap: z.number().min(10),
  maxInvestors: z.number().int().min(1),
  inviteOnly: z.boolean(),
  strategy: z.string().min(10),
});
type FormData = z.infer<typeof schema>;

export default function CreateFundModal() {
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = (d: FormData) => {
    console.log('payload', d);
    // TODO: FastAPI POST + Anchor call
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mt-6 bg-sol-accent text-sol-900 font-bold px-6 py-2 rounded-xl shadow hover:scale-105 transition-transform"
      >
        + Launch Your Fund
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="bg-sol-900 p-8 rounded-2xl w-full max-w-lg text-sol-50 space-y-4 overflow-y-auto max-h-[90vh]"
          >
            <h2 className="text-2xl font-bold mb-2">Launch new fund</h2>

            <input
              {...register('fundName')}
              placeholder="Fund Name"
              className="input"
            />
            {errors.fundName && <span className="error">Required</span>}

            <select {...register('type')} className="input">
              <option value="" disabled>
                Choose type
              </option>
              <option>Memes</option>
              <option>Arbitrage</option>
              <option>Leverage Futures</option>
              <option>Yield Farming</option>
            </select>

            <input
              {...register('perfFee', { valueAsNumber: true })}
              placeholder="Performance fee %"
              type="number"
              className="input"
            />

            <div className="flex gap-2">
              <input
                {...register('minTicket', { valueAsNumber: true })}
                type="number"
                placeholder="Min. ticket (SOL)"
                className="input flex-1"
              />
              <input
                {...register('maxTicket', { valueAsNumber: true })}
                type="number"
                placeholder="Max. ticket (SOL)"
                className="input flex-1"
              />
            </div>

            <input
              {...register('collectiveCap', { valueAsNumber: true })}
              type="number"
              placeholder="Collective cap (SOL)"
              className="input"
            />

            <input
              {...register('maxInvestors', { valueAsNumber: true })}
              type="number"
              placeholder="Max investors"
              className="input"
            />

            <label className="flex items-center gap-2">
              <input type="checkbox" {...register('inviteOnly')} />
              <span>Invite only</span>
            </label>

            <textarea
              {...register('strategy')}
              placeholder="Describe strategy (tokens, leverage, long/short…) "
              className="input h-24"
            />

            <p className="text-xs text-sol-200">
              You will deposit <b>10 SOL</b> seed. Fund-share tokens are non-transferable; redemption
              burns shares and sends back your proportional SOL.
            </p>

            <div className="flex gap-4">
              <button
                type="button"
                className="flex-1 border border-sol-500 rounded-xl py-2"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 bg-sol-accent text-sol-900 font-bold rounded-xl py-2"
              >
                Continue
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
