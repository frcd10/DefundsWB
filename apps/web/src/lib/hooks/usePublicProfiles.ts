"use client";
import { useCallback, useRef, useSyncExternalStore } from 'react';

export interface CachedPublicProfile {
  wallet: string;
  name?: string;
  bio?: string;
  twitter?: string;
  discord?: string;
  website?: string;
  stats?: { products: number; avgReturnPct: number };
  openItems?: { id: string; name: string; type: string }[];
  fetchedAt: number;
  loading?: boolean;
  error?: string;
}

// Simple in-memory store (per browser session)
const store: Record<string, CachedPublicProfile> = {};
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function getSnapshot() {
  return store;
}

/**
 * React hook for fetching & caching public profiles by wallet address.
 * Fetch de-duplication & stale-after interval supported.
 */
export function usePublicProfiles(opts: { staleMs?: number } = {}) {
  const { staleMs = 5 * 60 * 1000 } = opts; // 5 minutes
  const cacheRef = useRef(store);

  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const getProfile = useCallback(async (wallet: string | undefined | null) => {
    if (!wallet) return undefined;
    const key = wallet;
    const existing = cacheRef.current[key];
    const now = Date.now();
    if (existing && !existing.loading && now - existing.fetchedAt < staleMs) {
      return existing;
    }
    // Mark loading
    store[key] = existing ? { ...existing, loading: true } : { wallet: key, fetchedAt: now, loading: true };
    emit();
    try {
      const res = await fetch(`/api/profile?wallet=${key}`);
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      if (json.success && json.data) {
        store[key] = { ...json.data, fetchedAt: Date.now(), wallet: key };
      } else {
        store[key] = { wallet: key, fetchedAt: Date.now(), error: 'Not found' };
      }
    } catch (e: any) {
      store[key] = { wallet: key, fetchedAt: Date.now(), error: e?.message || 'Error' };
    }
    emit();
    return store[key];
  }, [staleMs]);

  return {
    cache: store,
    getProfile,
  };
}
