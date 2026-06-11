import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import Badge, { attendanceBadge } from '../../components/UI/Badge';
import Spinner from '../../components/UI/Spinner';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';

export default function AttendancePage() {
  const { isManager } = useAuth();
  const [todayData, setTodayData] = useState([]);
  const [myHistory, setMyHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState(isManager ? 'team' : 'my');
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());

  const load = async () => {
    setLoading(true);
    try {
      if (view === 'team' && isManager) {
        const { data } = await api.get('/attendance/today');
        setTodayData(data.attendance || []);
      } else {
        const { data } = await api.get(`/attendance/my?month=${month}&year=${year}`);
        setMyHistory(data.attendance || []);
      }
    } catch {
      toast.error('Failed to load attendance');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [view, month, year]);

  const fmtMins = (mins) => {
    if (!mins) return '—';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const months = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December'
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="page-title">Attendance</h1>
        {isManager && (
          <div className="flex items-center gap-2">
            <button onClick={() => setView('team')} className={`px-4 py-2 rounded-lg text-sm font-medium ${view === 'team' ? 'bg-primary-700 text-white' : 'btn-secondary'}`}>Team Today</button>
            <button onClick={() => setView('my')} className={`px-4 py-2 rounded-lg text-sm font-medium ${view === 'my' ? 'bg-primary-700 text-white' : 'btn-secondary'}`}>My History</button>
          </div>
        )}
      </div>

      {/* My history date filter */}
      {view === 'my' && (
        <div className="card p-3 flex items-center gap-3">
          <select value={month} onChange={e => setMonth(parseInt(e.target.value))} className="input-field w-auto">
            {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(parseInt(e.target.value))} className="input-field w-auto">
            {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48"><Spinner size="lg" /></div>
      ) : view === 'team' ? (
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-gray-800">
            <h2 className="section-title">Team Attendance — {format(new Date(), 'dd MMMM yyyy')}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  {['Caller', 'Status', 'Login Time', 'Logout Time', 'Break', 'Working Hours', 'Late'].map(h => (
                    <th key={h} className="table-header">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {todayData.map(att => {
                  const badge = attendanceBadge(att.status);
                  return (
                    <tr key={att.id}>
                      <td className="table-cell font-medium">{att.name}</td>
                      <td className="table-cell"><Badge variant={badge.variant}>{badge.label}</Badge></td>
                      <td className="table-cell">{att.login_time ? format(new Date(att.login_time), 'HH:mm') : '—'}</td>
                      <td className="table-cell">{att.logout_time ? format(new Date(att.logout_time), 'HH:mm') : att.login_time ? <span className="text-green-600 dark:text-green-400">Active</span> : '—'}</td>
                      <td className="table-cell">{fmtMins(att.total_break_minutes)}</td>
                      <td className="table-cell font-medium">{fmtMins(att.total_working_minutes)}</td>
                      <td className="table-cell">{att.is_late ? <Badge variant="red">Late</Badge> : att.login_time ? <Badge variant="green">On Time</Badge> : '—'}</td>
                    </tr>
                  );
                })}
                {!todayData.length && (
                  <tr><td colSpan={7} className="text-center py-12 text-gray-400">No attendance records for today</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-gray-800">
            <h2 className="section-title">My Attendance — {months[month - 1]} {year}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  {['Date', 'Status', 'Login', 'Logout', 'Break', 'Working Hours', 'Punctuality'].map(h => (
                    <th key={h} className="table-header">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {myHistory.map(att => {
                  const badge = attendanceBadge(att.status);
                  return (
                    <tr key={att.id}>
                      <td className="table-cell font-medium">{format(new Date(att.date), 'EEE, dd MMM')}</td>
                      <td className="table-cell"><Badge variant={badge.variant}>{badge.label}</Badge></td>
                      <td className="table-cell">{att.login_time ? format(new Date(att.login_time), 'HH:mm') : '—'}</td>
                      <td className="table-cell">{att.logout_time ? format(new Date(att.logout_time), 'HH:mm') : '—'}</td>
                      <td className="table-cell">{fmtMins(att.total_break_minutes)}</td>
                      <td className="table-cell font-medium">{fmtMins(att.total_working_minutes)}</td>
                      <td className="table-cell">{att.is_late ? <Badge variant="red">Late</Badge> : att.login_time ? <Badge variant="green">On Time</Badge> : '—'}</td>
                    </tr>
                  );
                })}
                {!myHistory.length && (
                  <tr><td colSpan={7} className="text-center py-12 text-gray-400">No records for this period</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
