import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import type { Ticket, Stats } from '../data/mockData';

 
function useFetch<T>(fetcher: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData]    = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetcher());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  
  }, deps);

  useEffect(() => { void load(); }, [load]);

  return { data, loading, error, refetch: load };
}

export function useTickets(filter?: string) {
  const params = filter && filter !== 'all' ? `status=${filter}` : undefined;
  return useFetch<Ticket[]>(() => api.tickets(params), [params]);
}

export function useStats() {
  return useFetch<Stats>(() => api.stats(), []);
}
