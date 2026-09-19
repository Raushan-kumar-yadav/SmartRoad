import type { Ticket, Stats } from '../data/mockData';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`API ${path} → ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

async function patch<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API PATCH ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API POST ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  // Dashboard-specific (flat)
  tickets:  (params?: string) => get<Ticket[]>(`/api/dashboard/tickets${params ? '?' + params : ''}`),
  stats:    ()                => get<Stats>('/api/dashboard/stats'),

  // Ticket actions
  updateTicket: (id: number, data: { status?: string; assignedTo?: string; notes?: string }) =>
    patch<Ticket>(`/api/tickets/${id}`, data),

  // Manual report
  submitReport: (body: {
    class_name: string;
    confidence: number;
    lat?: number;
    lon?: number;
    notes?: string;
    image_b64?: string;
  }) => post<{ report: unknown; ticket: Ticket }>('/api/report', body),
};
