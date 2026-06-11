import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import Badge from '../../components/UI/Badge';
import Spinner from '../../components/UI/Spinner';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

export default function AlertsPage() {
  const [alerts, setAlerts] = useState([]);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ page: 1, limit: 20, isResolved: 'false', severity: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => v !== '' && params.set(k, v));
      const { data } = await api.get(`/alerts?${params}`);
      setAlerts(data.data || []);
      setPagination(data.pagination || {});
    } catch { toast.error('Failed to load alerts'); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const markRead = async (id) => {
    await api.patch(`/alerts/${id}/read`).catch(() => {});
    load();
  };

  const resolveAlert = async (id) => {
    await api.patch(`/alerts/${id}/resolve`).catch(() => {});
    toast.success('Alert resolved');
    load();
  };

  const markAllRead = async () => {
    await api.patch('/alerts/mark-all-read').catch(() => {});
    toast.success('All alerts marked as read');
    load();
  };

  const severityConfig = {
    critical: { variant: 'red', dot: 'bg-red-500', label: 'Critical' },
    warning: { variant: 'amber', dot: 'bg-amber-500', label: 'Warning' },
    info: { variant: 'blue', dot: 'bg-blue-500', label: 'Info' },
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="page-title">Alerts</h1>
        <button onClick={markAllRead} className="btn-secondary text-sm">Mark All as Read</button>
      </div>

      <div className="card p-3 flex flex-wrap gap-2">
        <select value={filters.isResolved} onChange={e => setFilters(f => ({ ...f, isResolved: e.target.value, page: 1 }))} className="input-field w-auto">
          <option value="false">Active Alerts</option>
          <option value="true">Resolved</option>
          <option value="">All</option>
        </select>
        <select value={filters.severity} onChange={e => setFilters(f => ({ ...f, severity: e.target.value, page: 1 }))} className="input-field w-auto">
          <option value="">All Severities</option>
          <option value="critical">Critical</option>
          <option value="warning">Warning</option>
          <option value="info">Info</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><Spinner size="lg" /></div>
      ) : (
        <div className="space-y-2">
          {alerts.map(alert => {
            const cfg = severityConfig[alert.severity] || severityConfig.info;
            return (
              <div key={alert.id} className={`card p-4 flex items-start gap-3 transition-all ${!alert.is_read ? 'border-l-4 border-l-primary-500' : ''}`}>
                <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${cfg.dot}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">{alert.title}</p>
                        <Badge variant={cfg.variant}>{cfg.label}</Badge>
                        {!alert.is_read && <Badge variant="primary">New</Badge>}
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">{alert.message}</p>
                      {alert.user_name && (
                        <p className="text-xs text-gray-400 mt-0.5">Caller: {alert.user_name}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-gray-400">{format(new Date(alert.created_at), 'dd MMM, HH:mm')}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    {!alert.is_read && (
                      <button onClick={() => markRead(alert.id)} className="text-xs text-primary-700 dark:text-primary-400 hover:underline">Mark Read</button>
                    )}
                    {!alert.is_resolved && (
                      <button onClick={() => resolveAlert(alert.id)} className="text-xs text-green-600 dark:text-green-400 hover:underline">Resolve</button>
                    )}
                    {alert.is_resolved && <span className="text-xs text-gray-400">✓ Resolved</span>}
                  </div>
                </div>
              </div>
            );
          })}
          {!alerts.length && (
            <div className="card p-16 text-center">
              <svg className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-gray-500 dark:text-gray-400">No alerts found</p>
            </div>
          )}
        </div>
      )}

      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button disabled={!pagination.hasPrev} onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))} className="btn-secondary text-sm disabled:opacity-40">← Prev</button>
          <span className="text-sm text-gray-600 dark:text-gray-400">Page {filters.page} of {pagination.totalPages}</span>
          <button disabled={!pagination.hasNext} onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))} className="btn-secondary text-sm disabled:opacity-40">Next →</button>
        </div>
      )}
    </div>
  );
}
