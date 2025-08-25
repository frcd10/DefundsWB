'use client';

import { useState, useEffect, useMemo } from 'react';
import FilterBar, { Filters } from '@/components/FilterBar';
import FundCard from '@/components/FundCard';
import { mockFunds } from '@/data/mockFunds';
import CreateFundModal from '@/components/CreateFundModal';

const PAGE_SIZE = 21;

export default function Home() {
  const [filters, setFilters] = useState<Filters>({});
  const [page, setPage] = useState(0);          // 0-based

  /* ── Compute visible funds ----------------------------------------- */
  const filteredFunds = useMemo(() => {
    return mockFunds.filter((f) => {
      if (filters.maxPerfFee !== undefined && f.perfFee > filters.maxPerfFee)
        return false;
      if (filters.maxCap !== undefined && f.maxCap > filters.maxCap) return false;
      if (filters.type && f.type !== filters.type) return false;
      if (filters.query) {
        const q = filters.query.toLowerCase();
        if (
          !f.name.toLowerCase().includes(q) &&
          !f.handle.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [filters]);

  /* reset to first page when filters change */
  useEffect(() => setPage(0), [filters]);

  const totalPages = Math.max(1, Math.ceil(filteredFunds.length / PAGE_SIZE));
  const pageSlice = filteredFunds.slice(
    page * PAGE_SIZE,
    page * PAGE_SIZE + PAGE_SIZE,
  );

  /* ── Handlers ------------------------------------------------------ */
  const prev = () => setPage((p) => Math.max(0, p - 1));
  const next = () => setPage((p) => Math.min(totalPages - 1, p + 1));
  const goto = (i: number) => setPage(i);

  return (
    <main className="min-h-screen bg-gradient-to-b from-sol-900 via-sol-850 to-sol-800">
      <section className="max-w-6xl mx-auto px-4 py-20">
        {/* Hero */}
        <header className="mb-12 text-center">
          <h1 className="text-5xl font-extrabold text-white drop-shadow-lg">
            Solana Managed Funds
          </h1>
          <p className="text-sol-50 mt-4">
            The first marketplace where traders launch token funds on&nbsp;Solana.
          </p>
          <CreateFundModal />
        </header>

        {/* Filters */}
        <FilterBar onChange={setFilters} />

        {/* Cards grid */}
        {pageSlice.length === 0 ? (
          <p className="text-sol-50">No fund matches your filters.</p>
        ) : (
          <>
            <div className="grid md:grid-cols-3 gap-6 mb-10">
              {pageSlice.map((f) => (
                <FundCard f={f} key={f.id} />
              ))}
            </div>

            {/* Pagination controls */}
            <nav className="flex items-center justify-center gap-2">
              <button
                onClick={prev}
                disabled={page === 0}
                className="px-3 py-1 rounded-lg bg-sol-800/60 text-sol-100 disabled:opacity-40"
              >
                ‹ Prev
              </button>

              {/* small page buttons when ≤ 6 pages, otherwise show 1 … n */}
              {totalPages <= 6
                ? Array.from({ length: totalPages }).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => goto(i)}
                      className={`px-3 py-1 rounded-lg ${
                        page === i
                          ? 'bg-sol-accent text-sol-900 font-semibold'
                          : 'bg-sol-800/60 text-sol-100'
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))
                : (
                  <>
                    {page > 1 && (
                      <>
                        <button
                          onClick={() => goto(0)}
                          className="px-3 py-1 rounded-lg bg-sol-800/60 text-sol-100"
                        >
                          1
                        </button>
                        {page > 2 && <span className="text-sol-100">…</span>}
                      </>
                    )}
                    {page > 0 && (
                      <button
                        onClick={() => goto(page - 1)}
                        className="px-3 py-1 rounded-lg bg-sol-800/60 text-sol-100"
                      >
                        {page}
                      </button>
                    )}
                    <button
                      className="px-3 py-1 rounded-lg bg-sol-accent text-sol-900 font-semibold"
                    >
                      {page + 1}
                    </button>
                    {page < totalPages - 1 && (
                      <button
                        onClick={() => goto(page + 1)}
                        className="px-3 py-1 rounded-lg bg-sol-800/60 text-sol-100"
                      >
                        {page + 2}
                      </button>
                    )}
                    {page < totalPages - 2 && (
                      <>
                        {page < totalPages - 3 && (
                          <span className="text-sol-100">…</span>
                        )}
                        <button
                          onClick={() => goto(totalPages - 1)}
                          className="px-3 py-1 rounded-lg bg-sol-800/60 text-sol-100"
                        >
                          {totalPages}
                        </button>
                      </>
                    )}
                  </>
                )}

              <button
                onClick={next}
                disabled={page === totalPages - 1}
                className="px-3 py-1 rounded-lg bg-sol-800/60 text-sol-100 disabled:opacity-40"
              >
                Next ›
              </button>
            </nav>
          </>
        )}
      </section>
    </main>
  );
}
