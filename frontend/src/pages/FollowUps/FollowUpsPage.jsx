import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import Badge from '../../components/UI/Badge';
import Spinner from '../../components/UI/Spinner';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';

export default function FollowUpsPage() {
  const [followUps, setFollowUps] = useState([]);
  const [grouped, setGrouped] = useState({ red: [], amber: [], green: [] });
  const [pagination, setPagination] = useState({});
  const [callers, setCallers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('today'); // 'today' | 'all'
  const [filters, setFilters] = useState({ page: 1, limit: 20, category: '', callerId: '', isCompleted: '' });
  const { isManager } = useAuth();
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (view === 'today') {
        const { data } = await api.get('/follow-ups/today');
        setFollowUps(data.followUps || []);
        setGrouped(data.grouped || { red: [], amber: [], green: [] });
      } else {
        const params = new URLSearchParams();
        Object.entries(filters).forEach(([k, v]) => v !== '' && params.set(k, v));
        const { data } = await api.get(`/follow-ups?${params}`);
        setFollowUps(data.data || []);
        setPagination(data.pagination || {});
      }
    } catch {
      toast.error('Failed to load follow-ups');
    } finally {
      setLoading(false);
    }
  }, [view, filters]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (isManager) api.get('/users/callers').then(r => setCallers(r.data.callers || [])).catch(() => {});
  }, [isManager]);

  const completeFollowUp = async (id) => {
    try {
      await api.patch(`/follow-ups/${id}/complete`);
      toast.success('Follow-up completed');
      load();
    } catch {
      toast.error('Failed');
    }
  };

  const CategorySection = ({ category, items }) => {
    const configs = {
      red: { label: 'Overdue', bg: 'bg-red-50 dark:bg-red-900/10', border: 'border-red-300 dark:border-red-700', badge: 'red', headerBg: 'bg-red-100 dark:bg-red-900/20' },
      amber: { label: "Today's Follow-Ups", bg: 'bg-amber-50 dark:bg-amber-900/10', border: 'border-amber-300 dark:border-amber-700', badge: 'amber', headerBg: 'bg-amber-100 dark:bg-amber-900/20' },
      green: { label: "Tomorrow's Follow-Ups", bg: 'bg-green-50 dark:bg-green-900/10', border: 'border-green-300 dark:border-green-700', badge: 'green', headerBg: 'bg-green-100 dark:bg-green-900/20' },
    };
    const cfg = configs[category];
    if (!cfg) return null;

    return (
      <div className={`card overflow-hidden border ${cfg.border}`}>
        <div className={`px-4 py-3 ${cfg.headerBg} flex items-center justify-between`}>
          <h2 className="font-semibold text-gray-800 dark:text-gray-200">{cfg.label}</h2>
          <Badge variant={cfg.badge}>{items.length}</Badge>
        </div>
        {items.length === 0 ? (
          <p className="text-center text-gray-400 py-8 text-sm">No {cfg.label.toLowerCase()}</p>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {items.map(fu => (
              <div key={fu.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-gray-800 dark:text-gray-200">{fu.lead_name}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{fu.phone_number}</span>
                    {isManager && <span className="text-xs text-gray-400 dark:text-gray-500">· {fu.caller_name}</span>}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    <span>{format(new Date(fu.scheduled_date), 'dd MMM yyyy')}</span>
                    {fu.scheduled_time && <span>at {fu.scheduled_time.slice(0, 5)}</span>}
                    {fu.notes && <span>· {fu.notes}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => navigate(`/leads/${fu.lead_id}`)}
                    className="text-xs text-primary-700 dark:text-primary-400 hover:underline"
                  >
                    View Lead
                  </button>
                  {!fu.is_completed && (
                    <button
                      onClick={() => completeFollowUp(fu.id)}
                      className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-1 rounded-md hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
                    >
                      Done ✓
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="page-title">Follow-Ups</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView('today')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${view === 'today' ? 'bg-primary-700 text-white' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600'}`}
          >
            Today's View
          </button>
          <button
            onClick={() => setView('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${view === 'all' ? 'bg-primary-700 text-white' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600'}`}
          >
            All Follow-Ups
          </button>
        </div>
      </div>

      {/* Summary cards (today view) */}
      {view === 'today' && (
        <div className="grid grid-cols-3 gap-4">
          <div className="kpi-card border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10">
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">{grouped.red?.length || 0}</div>
            <p className="text-sm font-medium text-red-700 dark:text-red-400">Overdue</p>
          </div>
          <div className="kpi-card border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10">
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{grouped.amber?.length || 0}</div>
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Due Today</p>
          </div>
          <div className="kpi-card border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/10">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{grouped.green?.length || 0}</div>
            <p className="text-sm font-medium text-green-700 dark:text-green-400">Tomorrow</p>
          </div>
        </div>
      )}

      {/* All follow-ups filters */}
      {view === 'all' && (
        <div className="card p-3 flex flex-wrap gap-2">
          <select value={filters.category} onChange={e => setFilters(f => ({ ...f, category: e.target.value, page: 1 }))} className="input-field w-auto">
            <option value="">All Categories</option>
            <option value="red">Overdue</option>
            <option value="amber">Today</option>
            <option value="green">Upcoming</option>
          </select>
          {isManager && (
            <select value={filters.callerId} onChange={e => setFilters(f => ({ ...f, callerId: e.target.value, page: 1 }))} className="input-field w-auto">
              <option value="">All Callers</option>
              {callers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <select value={filters.isCompleted} onChange={e => setFilters(f => ({ ...f, isCompleted: e.target.value, page: 1 }))} className="input-field w-auto">
            <option value="">All</option>
            <option value="false">Pending</option>
            <option value="true">Completed</option>
          </select>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48"><Spinner size="lg" /></div>
      ) : view === 'today' ? (
        <div className="space-y-5">
          <CategorySection category="red" items={grouped.red || []} />
          <CategorySection category="amber" items={grouped.amber || []} />
          <CategorySection category="green" items={grouped.green || []} />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  {['Lead', 'Phone', isManager ? 'Caller' : null, 'Scheduled', 'Category', 'Status', ''].filter(Boolean).map(h => (
                    <th key={h} className="table-header">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {followUps.map(fu => (
                  <tr key={fu.id}>
                    <td className="table-cell font-medium">{fu.lead_name}</td>
                    <td className="table-cell text-gray-500 dark:text-gray-400">{fu.phone_number}</td>
                    {isManager && <td className="table-cell text-gray-600 dark:text-gray-400">{fu.caller_name}</td>}
                    <td className="table-cell">{format(new Date(fu.scheduled_date), 'dd MMM yyyy')}{fu.scheduled_time ? ` ${fu.scheduled_time.slice(0, 5)}` : ''}</td>
                    <td className="table-cell"><Badge variant={fu.category}>{fu.category}</Badge></td>
                    <td className="table-cell"><Badge variant={fu.is_completed ? 'green' : 'gray'}>{fu.is_completed ? 'Completed' : 'Pending'}</Badge></td>
                    <td className="table-cell flex gap-2">
                      <button onClick={() => navigate(`/leads/${fu.lead_id}`)} className="text-xs text-primary-700 dark:text-primary-400 hover:underline">View</button>
                      {!fu.is_completed && <button onClick={() => completeFollowUp(fu.id)} className="text-xs text-green-600 dark:text-green-400 hover:underline">Complete</button>}
                    </td>
                  </tr>
                ))}
                {!followUps.length && <tr><td colSpan={7} className="text-center py-12 text-gray-400">No follow-ups found</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
