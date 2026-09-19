import { useState } from 'react';
import { MOCK_TICKETS, MOCK_STATS, CLASS_EMOJI, type Ticket } from './data/mockData';
import TicketCard from './components/TicketCard';
import TicketDetailModal from './components/TicketDetailModal';
import RaiseComplaintModal from './components/RaiseComplaintModal';

type Page   = 'dashboard' | 'tickets';
type Filter = 'all' | 'open' | 'assigned' | 'in_progress' | 'resolved';

export default function App() {
  const [page, setPage] = useState<Page>('dashboard');
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedTicket,  setSelectedTicket]  = useState<Ticket | null>(null);
  const [showRaise, setShowRaise] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>(MOCK_TICKETS);
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);

  function showToast(msg: string, type = 'info') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  function handleCloseTicket(id: number) {
    setTickets(prev => prev.map(t => t.id === id ? { ...t, status: 'resolved' as const } : t));
    showToast('Ticket resolved · ward officer notified', 'success');
  }

  function handleRaiseSubmit() {
    setTimeout(() => {
      const t: Ticket = {
        id: tickets.length + 1, ticketCode: `TKT-${Date.now()}`,
        status: 'open', priority: 'medium', className: 'pothole',
        confidence: 0.79, wardName: 'New Delhi', wardZone: 'new_delhi',
        assignedTo: 'Officer New Delhi', lat: 28.6139, lon: 77.2090,
        imagePath: null, createdAt: new Date().toISOString(),
        notes: 'Manually raised', reportCount: 1,
      };
      setTickets(prev => [t, ...prev]);
      showToast('Complaint raised · ticket created', 'success');
      setShowRaise(false);
    }, 2000);
  }

  const filtered = filter === 'all' ? tickets : tickets.filter(t => t.status === filter);
  const openCount = tickets.filter(t => t.status === 'open').length;
  const criticalCount = tickets.filter(t => t.priority === 'critical').length;
  const resolvedCount = tickets.filter(t => t.status === 'resolved').length;

  return (
    <div className="layout">

       
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h1>SmartRoad</h1>
          <span>Defect Detection</span>
        </div>

        <div style={{ padding: '10px 10px 0' }}>
          <div className="live-badge">
            <span className="live-dot" />
            System Active
          </div>
        </div>

        <nav style={{ marginTop: 8 }}>
          <div className="nav-section-label">Menu</div>

          <div className={`nav-item ${page === 'dashboard' ? 'active' : ''}`} onClick={() => setPage('dashboard')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            Dashboard
          </div>

          <div className={`nav-item ${page === 'tickets' ? 'active' : ''}`} onClick={() => setPage('tickets')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
            All Tickets
            {openCount > 0 && <span style={{ marginLeft: 'auto', background: 'var(--red-dim)', color: 'var(--red)', fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 10 }}>{openCount}</span>}
          </div>

          <div className="sep" style={{ margin: '6px 10px' }} />

          <div className="nav-section-label">Actions</div>
          <div className="nav-item" onClick={() => setShowRaise(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 4v16m8-8H4" strokeLinecap="round"/></svg>
            Raise Complaint
          </div>
        </nav>

        {/* Sidebar stats */}
        <div className="sidebar-stats">
          {([
            ['Open',     openCount,     'var(--orange)'],
            ['Critical', criticalCount, 'var(--red)'],
            ['Resolved', resolvedCount, 'var(--green)'],
            ['Total',    tickets.length,'var(--text-muted)'],
          ] as [string, number, string][]).map(([l, v, c]) => (
            <div key={l} className="sidebar-stat">
              <div className="sidebar-stat-label">{l}</div>
              <div className="sidebar-stat-value" style={{ color: c }}>{v}</div>
            </div>
          ))}
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="main-content">

        {/* ── Dashboard ── */}
        {page === 'dashboard' && (
          <>
            <div className="page-header">
              <h2>Dashboard</h2>
              <p>Road defect detection · Delhi NCR</p>
            </div>

            {/* Stats */}
            <div className="stats-grid">
              {[
                { label: 'Total Reports',  value: MOCK_STATS.total,               icon: '📋', color: 'var(--text)' },
                { label: 'Open',           value: MOCK_STATS.openTickets,         icon: '🔓', color: 'var(--orange)' },
                { label: 'Resolved',       value: MOCK_STATS.resolvedTickets,     icon: '✓',  color: 'var(--green)' },
                { label: 'Last 24h',       value: MOCK_STATS.last24h,             icon: '⏱',  color: 'var(--accent-blue)' },
                { label: 'Critical',       value: MOCK_STATS.byPriority.critical, icon: '!',  color: 'var(--red)' },
              ].map(s => (
                <div className="stat-card" key={s.label}>
                  <div className="stat-card-label">{s.icon} {s.label}</div>
                  <div className="stat-card-value" style={{ color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* By type */}
            <div className="section">
              <div className="section-title">Defects by type</div>
              <div className="class-grid">
                {Object.entries(MOCK_STATS.byClass).map(([cls, count]) => (
                  <div className="class-chip" key={cls}>
                    <span className="class-chip-emoji">{CLASS_EMOJI[cls] ?? '📋'}</span>
                    <div>
                      <div className="class-chip-count">{count}</div>
                      <div className="class-chip-label">{cls.replace(/_/g, ' ')}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Latest tickets */}
            <div className="section">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div className="section-title" style={{ margin: 0 }}>Latest tickets</div>
                <button className="btn btn-ghost btn-sm" onClick={() => setPage('tickets')}>View all →</button>
              </div>
              <div className="tickets-grid">
                {tickets.slice(0, 3).map(t => (
                  <TicketCard key={t.id} ticket={t} onClick={setSelectedTicket} />
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── All Tickets ── */}
        {page === 'tickets' && (
          <>
            <div className="page-header">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h2>All Tickets</h2>
                  <p>{filtered.length} tickets{filter !== 'all' ? ` · ${filter.replace('_', ' ')}` : ''}</p>
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => setShowRaise(true)}>
                  + Raise
                </button>
              </div>
            </div>

            <div className="filter-bar">
              {(['all', 'open', 'assigned', 'in_progress', 'resolved'] as Filter[]).map(f => (
                <button key={f} className={`filter-btn ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
                  {f === 'in_progress' ? 'In Progress' : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>

            {filtered.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">🎉</div>
                <p>No {filter} tickets</p>
              </div>
            ) : (
              <div className="tickets-grid">
                {filtered.map(t => (
                  <TicketCard key={t.id} ticket={t} onClick={setSelectedTicket} />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* Modals */}
      {selectedTicket && (
        <TicketDetailModal ticket={selectedTicket} onClose={() => setSelectedTicket(null)} onCloseTicket={handleCloseTicket} />
      )}
      {showRaise && (
        <RaiseComplaintModal onClose={() => setShowRaise(false)} onSubmit={handleRaiseSubmit} />
      )}

      {/* Toast */}
      {toast && (
        <div className="toast-container">
          <div className={`toast ${toast.type}`}>
            <span className="toast-icon">{toast.type === 'success' ? '✓' : 'ℹ'}</span>
            <div className="toast-title">{toast.msg}</div>
          </div>
        </div>
      )}
    </div>
  );
}
