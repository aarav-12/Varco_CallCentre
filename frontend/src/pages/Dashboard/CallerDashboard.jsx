import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import KpiCard from '../../components/UI/KpiCard';
import Badge from '../../components/UI/Badge';
import Spinner from '../../components/UI/Spinner';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const rupee = (n) => `₹${parseFloat(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export default function CallerDashboard() {
  const [stats, setStats] = useState(null);
  const [attendance, setAttendance] = useState(null);
  const [followUps, setFollowUps] = useState({ grouped: { red: [], amber: [], green: [] } });
  const [myLeads, setMyLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [breakStartTime, setBreakStartTime] = useState(null);
  const navigate = useNavigate();

  const loadData = async () => {
    try {
      const [statsRes, attRes, fuRes, leadsRes] = await Promise.all([
        api.get('/calls/stats/caller'),
        api.get('/attendance/my/today'),
        api.get('/follow-ups/today'),
        api.get('/leads?limit=5&sortBy=updated_at&sortOrder=desc'),
      ]);
      setStats(statsRes.data.stats);
      setAttendance(attRes.data.attendance);
      setFollowUps(fuRes.data);
      setMyLeads(leadsRes.data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAttendance = async (action) => {
    try {
      const endpoints = {
        login: '/attendance/login',
        logout: '/attendance/logout',
        break_start: '/attendance/break/start',
        break_end: '/attendance/break/end',
      };

      const payload = action === 'break_end' ? { breakStartTime } : {};
      const { data } = await api.post(endpoints[action], payload);

      if (action === 'break_start') setBreakStartTime(new Date().toISOString());
      if (action === 'break_end') setBreakStartTime(null);

      setAttendance(data.attendance);
      toast.success(data.message);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Action failed');
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;
  }

  const s = stats || {};
  const att = attendance;
  const attStatus = att?.status || 'offline';

  const statusConfig = {
    online: { label: 'Online', color: 'green', dot: 'bg-green-500' },
    offline: { label: 'Offline', color: 'gray', dot: 'bg-gray-400' },
    on_break: { label: 'On Break', color: 'amber', dot: 'bg-amber-500' },
    late: { label: 'Late', color: 'red', dot: 'bg-red-500' },
  };

  const cfg = statusConfig[attStatus] || statusConfig.offline;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">My Dashboard</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{format(new Date(), 'EEEE, dd MMMM yyyy')}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`status-dot ${cfg.dot}`} />
          <Badge variant={cfg.color}>{cfg.label}</Badge>
        </div>
      </div>

      {/* Shift Controls */}
      <div className="card p-4">
        <h2 className="section-title mb-3">Shift Controls</h2>
        <div className="flex flex-wrap gap-2">
          {!att?.login_time && (
            <button onClick={() => handleAttendance('login')} className="btn-primary text-sm">
              Login to Shift
            </button>
          )}
          {att?.login_time && !att?.logout_time && attStatus !== 'on_break' && (
            <>
              <button onClick={() => handleAttendance('break_start')} className="btn-secondary text-sm">
                Start Break
              </button>
              <button onClick={() => handleAttendance('logout')} className="bg-red-600 hover:bg-red-700 text-white font-medium px-4 py-2 rounded-lg transition-colors text-sm">
                Logout from Shift
              </button>
            </>
          )}
          {attStatus === 'on_break' && (
            <button onClick={() => handleAttendance('break_end')} className="btn-primary text-sm">
              End Break
            </button>
          )}
          {att?.login_time && (
            <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400 ml-2">
              {att.login_time && <span>Login: <strong className="text-gray-700 dark:text-gray-300">{format(new Date(att.login_time), 'HH:mm')}</strong></span>}
              {att.total_break_minutes > 0 && <span>Break: <strong className="text-gray-700 dark:text-gray-300">{att.total_break_minutes}m</strong></span>}
              {att.is_late && <Badge variant="red">Late</Badge>}
            </div>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard title="Calls Today" value={s.calls_attempted || 0} subtitle="Target: 100" color="primary"
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>} />
        <KpiCard title="Connected" value={s.connected_calls || 0}
          subtitle={`${s.calls_attempted > 0 ? ((s.connected_calls / s.calls_attempted) * 100).toFixed(0) : 0}% connect rate`}
          color="blue"
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
        <KpiCard title="Orders" value={s.orders_closed || 0} subtitle={`${s.conversion_rate || 0}% conversion`} color="green"
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>} />
        <KpiCard title="Revenue" value={rupee(s.revenue_generated)} color="amber"
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
        <KpiCard title="Follow-Ups" value={s.follow_ups_scheduled || 0} color="purple"
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>} />
        <KpiCard title="Avg Duration" value={`${Math.round(s.avg_call_duration || 0)}s`} color="blue"
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Follow-ups */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="section-title">My Follow-Ups</h2>
            <button onClick={() => navigate('/follow-ups')} className="text-xs text-primary-700 dark:text-primary-400 hover:underline">View all</button>
          </div>
          <div className="space-y-2">
            {[
              { key: 'red', label: 'Overdue', bg: 'bg-red-50 dark:bg-red-900/10', border: 'border-red-200 dark:border-red-800', text: 'text-red-700 dark:text-red-400' },
              { key: 'amber', label: "Today", bg: 'bg-amber-50 dark:bg-amber-900/10', border: 'border-amber-200 dark:border-amber-800', text: 'text-amber-700 dark:text-amber-400' },
              { key: 'green', label: "Tomorrow", bg: 'bg-green-50 dark:bg-green-900/10', border: 'border-green-200 dark:border-green-800', text: 'text-green-700 dark:text-green-400' },
            ].map(({ key, label, bg, border, text }) => (
              <div key={key} className={`flex items-center justify-between p-3 rounded-lg border ${bg} ${border}`}>
                <span className={`text-sm font-medium ${text}`}>{label}</span>
                <span className={`text-xl font-bold ${text}`}>{followUps.grouped?.[key]?.length || 0}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Leads */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="section-title">Recent Leads</h2>
            <button onClick={() => navigate('/leads')} className="text-xs text-primary-700 dark:text-primary-400 hover:underline">View all</button>
          </div>
          <div className="space-y-2">
            {myLeads.slice(0, 5).map(lead => (
              <div
                key={lead.id}
                onClick={() => navigate(`/leads/${lead.id}`)}
                className="flex items-center justify-between p-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{lead.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{lead.phone_number}</p>
                </div>
                <Badge variant={
                  lead.status === 'order_confirmed' ? 'green' :
                  lead.status === 'interested' ? 'blue' :
                  lead.status === 'follow_up_required' ? 'purple' :
                  lead.status === 'not_interested' ? 'red' : 'gray'
                }>
                  {lead.status.replace(/_/g, ' ')}
                </Badge>
              </div>
            ))}
            {!myLeads.length && (
              <p className="text-sm text-gray-400 text-center py-6">No leads assigned yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
