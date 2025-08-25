/* app/portfolio/page.tsx */
'use client';

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';

// ------------------------------------------------------------------
// ‣ Mock data -------------------------------------------------------
const addr = '9XhZ…3Wb1t';

const portfolioHistory = [
  { date: '2024-04', value: 100 },
  { date: '2024-07', value: 550 },
  { date: '2024-10', value: 330 },
  { date: '2025-01', value: 789 },
  { date: '2025-04', value: 1200 },
];

// start capital = 100 SOL, so % == SOL for demo
const positions = [
  { fund: 'Bonk Legend Fund', pnlSol: 520,  pnlPct: 520 },
  { fund: 'Arb Titans',       pnlSol: -45,  pnlPct: -45 },
  { fund: 'Yieldies',         pnlSol: 180,  pnlPct: 180 },
  { fund: 'Meme Long-only',   pnlSol: 320,  pnlPct: 320 },
  { fund: 'Perp Masters',     pnlSol: -60,  pnlPct: -60 },
  { fund: 'Quant Alpha',      pnlSol: 85,   pnlPct: 85 },
  { fund: 'Stable Farm',      pnlSol: 0,    pnlPct: 0 },
  { fund: 'DeFi Index',       pnlSol: 110,  pnlPct: 110 },
  { fund: 'Futures Turbo',    pnlSol: 160,  pnlPct: 160 },
  { fund: 'NFT Floor Hedge',  pnlSol: 30,   pnlPct: 30 },
];
// ------------------------------------------------------------------

export default function Portfolio() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-sol-900 via-sol-850 to-sol-800">
      <section className="max-w-6xl mx-auto px-4 pt-20">
        <h1 className="text-4xl font-extrabold text-sol-50 mb-8">My portfolio</h1>

        {/* Address */}
        <div className="mb-8">
          <span className="text-sol-200">Solana address:</span>{' '}
          <code className="text-sol-accent">{addr}</code>
        </div>

        {/* Chart */}
        <div className="h-64 bg-sol-800/60 rounded-2xl p-4 mb-12">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={portfolioHistory}>
              <Line type="monotone" dataKey="value" stroke="#44FFB3" strokeWidth={2} dot={false} />
              <XAxis dataKey="date" stroke="#AAA" />
              <YAxis stroke="#AAA" domain={[0, 'dataMax']} />
              <Tooltip contentStyle={{ background: '#111', border: 'none' }} labelStyle={{ color: '#AAA' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Positions */}
        <table className="w-full text-sol-50">
          <thead>
            <tr className="text-left border-b border-sol-700">
              <th className="py-2">Fund</th>
              <th className="py-2">P/L&nbsp;(SOL)</th>
              <th className="py-2">P/L&nbsp;(%)</th>
              <th className="py-2 text-right">Withdraw</th>
            </tr>
          </thead>
          <tbody>
            {positions.map(({ fund, pnlSol, pnlPct }) => {
              const cls = pnlSol >= 0 ? 'text-green-400' : 'text-red-400';
              return (
                <tr key={fund} className="border-b border-sol-800">
                  <td className="py-2">{fund}</td>
                  <td className={`py-2 font-semibold ${cls}`}>{pnlSol.toFixed(2)}</td>
                  <td className={`py-2 font-semibold ${cls}`}>{pnlPct.toFixed(0)}%</td>
                  {/* right-aligned small withdraw UI */}
                  <td className="py-2 text-right">
                    <div className="inline-flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        placeholder="%"
                        className="w-14 input text-sm"
                        onChange={(e) =>
                          console.log('desired %', fund, Number(e.target.value))
                        }
                      />
                      <button
                        onClick={() => console.log('withdraw click', fund)}
                        className="px-2 py-1 rounded-md bg-sol-accent text-sol-900 text-xs font-semibold hover:scale-105 transition"
                      >
                        Go
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </main>
  );
}
