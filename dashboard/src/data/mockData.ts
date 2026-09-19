//   Types shared across dashboard  

export interface Ticket {
  id: number;
  ticketCode: string;
  status: 'open' | 'assigned' | 'in_progress' | 'resolved';
  priority: 'critical' | 'high' | 'medium' | 'low';
  className: string;
  confidence: number;
  wardName: string;
  wardZone: string;
  assignedTo: string;
  lat: number | null;
  lon: number | null;
  imagePath: string | null;
  createdAt: string;
  resolvedAt?: string | null;
  notes: string | null;
  reportCount: number;
}

export interface Stats {
  total: number;
  openTickets: number;
  resolvedTickets: number;
  inProgress: number;
  assigned: number;
  last24h: number;
  byClass: Record<string, number>;
  byPriority: Record<string, number>;
  byStatus: Record<string, number>;
  byWard: Record<string, number>;
}

//   Display constants  

export const CLASS_EMOJI: Record<string, string> = {
  pothole: '🕳️',
  road_crack: '🔩',
  broken_pole: '⚡',
  waterlogging: '💧',
  garbage_dump: '🗑️',
  broken_footpath: '🚶',
};

export const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  resolved: 'Resolved',
};

export const PRIORITY_COLOR: Record<string, string> = {
  critical: 'var(--red)',
  high: 'var(--orange)',
  medium: 'var(--yellow)',
  low: 'var(--green)',
};
