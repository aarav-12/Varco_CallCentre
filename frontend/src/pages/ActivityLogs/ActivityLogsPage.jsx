import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import Badge from '../../components/UI/Badge';
import Spinner from '../../components/UI/Spinner';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const ACTION_COLORS = {
  LOGIN: 'green', LOGOUT: 'gray', USER_CREATED: 'primary', USER_UPDATED: 'blue',
  USER_DISABLED: 'red', USER_ENABLED: 'green', PASSWORD_RESET: 'amber',
  LEAD_CREATED: 'primary', LEAD_UPDATED: 'blue', LEAD_DELETED: 'red',
  LEAD_REASSIGNED: 'purple', LEADS_BULK_DELETED: 'red', LEADS_BULK_REASSIGNED: 'purple',
  LEADS_IMPORTED: 'green', NOTE_ADDED: 'blue', FOLLOWUP_CREATED: 'purple',
  FOLLOWUP_COMPLETED: 'green', STATUS_CHANGED: 'amber', SHIFT_LOGIN: 'green', SHIFT_LOGOUT: 'gray',
};

export default function ActivityLogsPage() {
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ page: 1, limit: 30, action: '', entityType: '', startDate: '', endDate: '', search: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => v && params.set(k, v));
      const { data } = await api.get(`/activity-logs?${params}`);
      setLogs(data.data || []);
      setPagination(data.pagination || {});
    } catch { toast.error('Failed to load logs'); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const exportLogs = async (format) => {
    try {
      const params = new URLSearchParams({ format, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) });
      const { data } = await api.get(`/activity-logs/export?${params}`, { responseType: 'blob' });
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `activity-logs.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Export failed'); }
  };

  const ACTIONS = ['LOGIN','LOGOUT','LEAD_CREATED','LEAD_UPDATED','LEAD_DELETED','LEAD_REASSIGNED','LEADS_IMPORTED','NOTE_ADDED','FOLLOWUP_CREATED','STATUS_CHANGED','USER_CREATED','USER_UPDATED','PASSWORD_RESET','SHIFT_LOGIN','SHIFT_LOGOUT'];
  const ENTITIES = ['user','lead','follow_up','attendance'];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="page-title">Activity Logs</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => exportLogs('csv')} className="btn-secondary text-sm">Export CSV</button>
          <button onClick={() => exportLogs('xlsx')} className="btn-secondary text-sm">Export Excel</button>
        </div>
      </div>

      <div className="card p-3 flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Search user or action..."
          value={filters.search}
          onChange={e => setFilters(f => ({ ...f, search: e.target.value, page: 1 }))}
          className="input-field w-48 flex-1"
        />
        <select value={filters.action} onChange={e => setFilters(f => ({ ...f, action: e.target.value, page: 1 }))} className="input-field w-auto">
          <option value="">All Actions</option>
          {ACTIONS.map(a => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}
        </select>
        <select value={filters.entityType} onChange={e => setFilters(f => ({ ...f, entityType: e.target.value, page: 1 }))} className="input-field w-auto">
          <option value="">All Entities</option>
          {ENTITIES.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        <input type="date" value={filters.startDate} onChange={e => setFilters(f => ({ ...f, startDate: e.target.value, page: 1 }))} className="input-field w-auto" />
        <input type="date" value={filters.endDate} onChange={e => setFilters(f => ({ ...f, endDate: e.target.value, page: 1 }))} className="input-field w-auto" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><Spinner size="lg" /></div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  {['Time', 'User', 'Role', 'Action', 'Entity', 'IP Address'].map(h => (
                    <th key={h} className="table-header">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {logs.map(log => (
                  <tr key={log.id}>
                    <td className="table-cell text-xs text-gray-500 dark:text-gray-400">
                      {format(new Date(log.created_at), 'dd MMM, HH:mm:ss')}
                    </td>
                    <td className="table-cell font-medium text-sm">{log.user_name || '—'}</td>
                    <td className="table-cell">
                      {log.user_role && <Badge variant={log.user_role === 'manager' ? 'primary' : 'blue'}>{log.user_role}</Badge>}
                    </td>
                    <td className="table-cell">
                      <Badge variant={ACTION_COLORS[log.action] || 'gray'}>{log.action.replace(/_/g, ' ')}</Badge>
                    </td>
                    <td className="table-cell text-gray-500 dark:text-gray-400 text-xs">{log.entity_type || '—'}</td>
                    <td className="table-cell text-gray-400 text-xs font-mono">{log.ip_address || '—'}</td>
                  </tr>
                ))}
                {!logs.length && (
                  <tr><td colSpan={6} className="text-center py-12 text-gray-400">No activity logs found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {pagination.total} total logs
          </p>
          <div className="flex items-center gap-2">
            <button disabled={!pagination.hasPrev} onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))} className="btn-secondary text-sm disabled:opacity-40">← Prev</button>
            <span className="text-sm text-gray-600 dark:text-gray-400">Page {filters.page} of {pagination.totalPages}</span>
            <button disabled={!pagination.hasNext} onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))} className="btn-secondary text-sm disabled:opacity-40">Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}
