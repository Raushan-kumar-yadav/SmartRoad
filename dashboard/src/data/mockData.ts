 

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
  lat: number;
  lon: number;
  imagePath: string | null;
  createdAt: string;
  notes: string | null;
  reportCount: number;
}

export interface Stats {
  total: number;
  openTickets: number;
  resolvedTickets: number;
  inProgress: number;
  last24h: number;
  byClass: Record<string, number>;
  byPriority: Record<string, number>;
}

export const MOCK_TICKETS: Ticket[] = [
  { id: 1, ticketCode: 'TKT-20260919-0001', status: 'open',        priority: 'critical', className: 'broken_pole',     confidence: 0.94, wardName: 'North Delhi',   wardZone: 'north',     assignedTo: 'Officer North Delhi',   lat: 28.7891, lon: 77.1234, imagePath: null, createdAt: new Date(Date.now() - 1000*60*8).toISOString(),       notes: null,                           reportCount: 1 },
  { id: 2, ticketCode: 'TKT-20260919-0002', status: 'assigned',    priority: 'high',     className: 'pothole',          confidence: 0.87, wardName: 'New Delhi',     wardZone: 'new_delhi', assignedTo: 'Officer New Delhi',     lat: 28.6139, lon: 77.2090, imagePath: null, createdAt: new Date(Date.now() - 1000*60*35).toISOString(),      notes: null,                           reportCount: 3 },
  { id: 3, ticketCode: 'TKT-20260919-0003', status: 'in_progress', priority: 'high',     className: 'waterlogging',     confidence: 0.81, wardName: 'East Delhi',    wardZone: 'east',      assignedTo: 'Officer East Delhi',    lat: 28.6280, lon: 77.3102, imagePath: null, createdAt: new Date(Date.now() - 1000*60*120).toISOString(),     notes: 'Team dispatched',             reportCount: 2 },
  { id: 4, ticketCode: 'TKT-20260919-0004', status: 'open',        priority: 'medium',   className: 'road_crack',       confidence: 0.73, wardName: 'South Delhi',   wardZone: 'south',     assignedTo: 'Officer South Delhi',   lat: 28.5012, lon: 77.1800, imagePath: null, createdAt: new Date(Date.now() - 1000*60*200).toISOString(),     notes: null,                           reportCount: 1 },
  { id: 5, ticketCode: 'TKT-20260919-0005', status: 'resolved',    priority: 'low',      className: 'garbage_dump',     confidence: 0.68, wardName: 'West Delhi',    wardZone: 'west',      assignedTo: 'Officer West Delhi',    lat: 28.6490, lon: 76.9789, imagePath: null, createdAt: new Date(Date.now() - 1000*60*60*5).toISOString(),   notes: 'Cleared by sanitation team',  reportCount: 1 },
  { id: 6, ticketCode: 'TKT-20260919-0006', status: 'open',        priority: 'medium',   className: 'broken_footpath',  confidence: 0.76, wardName: 'Central Delhi', wardZone: 'central',   assignedTo: 'Officer Central Delhi', lat: 28.6400, lon: 77.2200, imagePath: null, createdAt: new Date(Date.now() - 1000*60*60*8).toISOString(),   notes: null,                           reportCount: 1 },
];

export const MOCK_STATS: Stats = {
  total: 42, openTickets: 18, resolvedTickets: 21, inProgress: 3, last24h: 7,
  byClass:    { pothole: 14, road_crack: 9, broken_pole: 6, waterlogging: 5, garbage_dump: 5, broken_footpath: 3 },
  byPriority: { critical: 5, high: 13, medium: 16, low: 8 },
};

export const CLASS_EMOJI: Record<string, string> = {
  pothole: '🕳️', road_crack: '🔩', broken_pole: '⚡',
  waterlogging: '💧', garbage_dump: '🗑️', broken_footpath: '🚶',
};

export const STATUS_LABEL: Record<string, string> = {
  open: 'Open', assigned: 'Assigned', in_progress: 'In Progress', resolved: 'Resolved',
};
