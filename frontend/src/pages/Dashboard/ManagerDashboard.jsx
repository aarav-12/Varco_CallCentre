import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import api from '../../services/api';
import KpiCard from '../../components/UI/KpiCard';
import Badge, { attendanceBadge } from '../../components/UI/Badge';
import Spinner from '../../components/UI/Spinner';
import { format } from 'date-fns';

const TARGETS = { daily_calls_team: 500, daily_calls_per_caller: 100, orders_per_caller: 20, avg_order_value: 1250 };

const rupee = (n) => `₹${parseFloat(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const pct = (a, b) => b > 0 ? ((a / b) * 100).toFixed(1) : 0;

export default function ManagerDashboard() {
  const [teamStats, setTeamStats] = useState(null);
  const [followUps, setFollowUps] = useState({ grouped: { red: [], amber: [], green: [] } });
  const [trends, setTrends] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      try {
        const [statsRes, fuRes, trendsRes, alertsRes] = await Promise.all([
          api.get('/calls/stats/team'),
          api.get('/follow-ups/today'),
          api.get('/calls/trends?period=weekly'),
          api.get('/alerts?isResolved=false&limit=5'),
        ]);
        setTeamStats(statsRes.data);
        setFollowUps(fuRes.data);
        setTrends(trendsRes.data.trends || []);
        setAlerts(alertsRes.data.data || []);
      } catch (err) {
        console.error('Dashboard load error:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
    const interval = setInterval(load, 120000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;
  }

  const totals = teamStats?.totals || {};
  const callers = teamStats?.callers || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Manager Dashboard</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {format(new Date(), 'EEEE, dd MMMM yyyy')}
          </p>
        </div>
        <button onClick={() => window.location.reload()} className="btn-secondary text-sm">
          Refresh
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total Calls Today"
          value={totals.total_calls || 0}
          subtitle={`Target: ${TARGETS.daily_calls_team}`}
          color="primary"
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>}
        />
        <KpiCard
          title="Connected Calls"
          value={totals.connected_calls || 0}
          subtitle={`${pct(totals.connected_calls, totals.total_calls)}% connect rate`}
          color="blue"
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>}
        />
        <KpiCard
          title="Orders Confirmed"
          value={totals.orders || 0}
          subtitle={`${totals.conversion_rate || 0}% conversion`}
          color="green"
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
        <KpiCard
          title="Revenue Today"
          value={rupee(totals.revenue)}
          subtitle={`Avg: ${rupee((totals.revenue || 0) / Math.max(totals.orders || 1, 1))}/order`}
          color="amber"
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Caller Status Table */}
        <div className="xl:col-span-2 card overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <h2 className="section-title">Caller Performance</h2>
            <span className="text-xs text-gray-500 dark:text-gray-400">{format(new Date(), 'dd MMM yyyy')}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  {['Caller', 'Status', 'Login', 'Calls', 'Connected', 'Orders', 'Revenue', 'Follow-Ups'].map(h => (
                    <th key={h} className="table-header">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {callers.map(c => {
                  const att = attendanceBadge(c.attendance_status);
                  return (
                    <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="table-cell font-medium">{c.name}</td>
                      <td className="table-cell">
                        <Badge variant={att.variant}>{att.label}</Badge>
                      </td>
                      <td className="table-cell text-gray-500 dark:text-gray-400 text-xs">
                        {c.login_time ? format(new Date(c.login_time), 'HH:mm') : '—'}
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{c.calls_attempted}</span>
                          <div className="flex-1 min-w-[40px] bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                            <div
                              className="bg-primary-600 h-1.5 rounded-full"
                              style={{ width: `${Math.min(100, (c.calls_attempted / TARGETS.daily_calls_per_caller) * 100)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="table-cell">{c.connected_calls}</td>
                      <td className="table-cell">
                        <span className={`font-medium ${parseInt(c.orders_closed) > 0 ? 'text-green-600 dark:text-green-400' : ''}`}>
                          {c.orders_closed}
                        </span>
                      </td>
                      <td className="table-cell text-green-600 dark:text-green-400 font-medium">
                        {rupee(c.revenue)}
                      </td>
                      <td className="table-cell">
                        <span className={`font-medium ${parseInt(c.pending_followups) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400'}`}>
                          {c.pending_followups}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {!callers.length && (
                  <tr><td colSpan={8} className="table-cell text-center text-gray-400 py-8">No caller data for today</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Follow-up summary + Alerts */}
        <div className="space-y-4">
          {/* Follow-up categories */}
          <div className="card p-4">
            <h2 className="section-title mb-3">Follow-Ups</h2>
            <div className="space-y-3">
              {[
                { key: 'red', label: 'Overdue', color: 'bg-red-500', textColor: 'text-red-600 dark:text-red-400' },
                { key: 'amber', label: "Today's", color: 'bg-amber-500', textColor: 'text-amber-600 dark:text-amber-400' },
                { key: 'green', label: "Tomorrow's", color: 'bg-green-500', textColor: 'text-green-600 dark:text-green-400' },
              ].map(({ key, label, color, textColor }) => (
                <div key={key} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
                  </div>
                  <span className={`text-lg font-bold ${textColor}`}>
                    {followUps.grouped?.[key]?.length || 0}
                  </span>
                </div>
              ))}
              <button onClick={() => navigate('/follow-ups')} className="w-full text-center text-sm text-primary-700 dark:text-primary-400 font-medium hover:underline pt-1">
                View All Follow-Ups →
              </button>
            </div>
          </div>

          {/* Recent Alerts */}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="section-title">Recent Alerts</h2>
              <button onClick={() => navigate('/alerts')} className="text-xs text-primary-700 dark:text-primary-400 hover:underline">View all</button>
            </div>
            <div className="space-y-2">
              {alerts.slice(0, 4).map(alert => (
                <div key={alert.id} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800">
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                    alert.severity === 'critical' ? 'bg-red-500' :
                    alert.severity === 'warning' ? 'bg-amber-500' : 'bg-blue-500'
                  }`} />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{alert.title}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{alert.message}</p>
                  </div>
                </div>
              ))}
              {!alerts.length && (
                <p className="text-xs text-gray-400 text-center py-4">No active alerts</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Trend Chart */}
      {trends.length > 0 && (
        <div className="card p-4">
          <h2 className="section-title mb-4">7-Day Performance Trend</h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={trends} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} tickFormatter={d => format(new Date(d), 'dd MMM')} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v, n) => [v, n === 'revenue' ? rupee(v) : v]} />
              <Legend />
              <Bar dataKey="calls" name="Calls" fill="#0F6E56" radius={[3, 3, 0, 0]} />
              <Bar dataKey="connected" name="Connected" fill="#3aba8c" radius={[3, 3, 0, 0]} />
              <Bar dataKey="orders" name="Orders" fill="#f59e0b" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
