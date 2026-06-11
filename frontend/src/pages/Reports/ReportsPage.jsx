import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import Badge from '../../components/UI/Badge';
import KpiCard from '../../components/UI/KpiCard';
import Spinner from '../../components/UI/Spinner';
import toast from 'react-hot-toast';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line } from 'recharts';
import { format } from 'date-fns';

const rupee = (n) => `₹${parseFloat(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export default function ReportsPage() {
  const [tab, setTab] = useState('daily');
  const [dailyData, setDailyData] = useState(null);
  const [weeklyData, setWeeklyData] = useState(null);
  const [monthlyData, setMonthlyData] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [leaderPeriod, setLeaderPeriod] = useState('daily');

  const loadDaily = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/reports/daily?date=${date}`);
      setDailyData(data);
    } catch { toast.error('Failed'); }
    finally { setLoading(false); }
  };

  const loadWeekly = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/reports/weekly');
      setWeeklyData(data);
    } catch { toast.error('Failed'); }
    finally { setLoading(false); }
  };

  const loadMonthly = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/reports/monthly?month=${month}&year=${year}`);
      setMonthlyData(data);
    } catch { toast.error('Failed'); }
    finally { setLoading(false); }
  };

  const loadLeaderboard = async () => {
    try {
      const { data } = await api.get(`/reports/leaderboard?period=${leaderPeriod}`);
      setLeaderboard(data.leaderboard || []);
    } catch {}
  };

  useEffect(() => {
    if (tab === 'daily') loadDaily();
    if (tab === 'weekly') loadWeekly();
    if (tab === 'monthly') loadMonthly();
    loadLeaderboard();
  }, [tab, date, month, year, leaderPeriod]);

  const exportReport = async (fmt) => {
    try {
      const params = new URLSearchParams({ format: fmt, date });
      const { data } = await api.get(`/reports/export?${params}`, { responseType: 'blob' });
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report.${fmt}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Export failed'); }
  };

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="page-title">Reports</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => exportReport('csv')} className="btn-secondary text-sm">Export CSV</button>
          <button onClick={() => exportReport('xlsx')} className="btn-secondary text-sm">Export Excel</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg w-fit">
        {['daily', 'weekly', 'monthly'].map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${tab === t ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Date filters */}
      <div className="flex items-center gap-3 flex-wrap">
        {tab === 'daily' && <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input-field w-auto" />}
        {tab === 'monthly' && (
          <>
            <select value={month} onChange={e => setMonth(e.target.value)} className="input-field w-auto">
              {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <select value={year} onChange={e => setYear(e.target.value)} className="input-field w-auto">
              {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </>
        )}
      </div>

      {loading && <div className="flex items-center justify-center h-32"><Spinner size="lg" /></div>}

      {/* Daily Report */}
      {!loading && tab === 'daily' && dailyData && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard title="Total Calls" value={dailyData.totals?.total_calls || 0} color="primary"
              icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>} />
            <KpiCard title="Connected" value={dailyData.totals?.connected_calls || 0} color="blue"
              icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
            <KpiCard title="Orders" value={dailyData.totals?.orders || 0} subtitle={`${dailyData.totals?.conversion_rate || 0}% conv`} color="green"
              icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>} />
            <KpiCard title="Revenue" value={rupee(dailyData.totals?.revenue)} color="amber"
              icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
          </div>

          <div className="card overflow-hidden">
            <div className="p-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="section-title">Caller Performance — {format(new Date(date), 'dd MMMM yyyy')}</h2>
            </div>
            <table className="w-full">
              <thead>
                <tr>{['Caller','Calls','Connected','Orders','Revenue','Conversion'].map(h => <th key={h} className="table-header">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {dailyData.calls?.map(r => (
                  <tr key={r.name}>
                    <td className="table-cell font-medium">{r.name}</td>
                    <td className="table-cell">{r.total_calls}</td>
                    <td className="table-cell">{r.connected_calls}</td>
                    <td className="table-cell text-green-600 dark:text-green-400 font-medium">{r.orders}</td>
                    <td className="table-cell text-green-600 dark:text-green-400 font-medium">{rupee(r.revenue)}</td>
                    <td className="table-cell">{r.total_calls > 0 ? `${((r.orders / r.total_calls) * 100).toFixed(1)}%` : '0%'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Weekly Report */}
      {!loading && tab === 'weekly' && weeklyData && (
        <div className="space-y-5">
          {weeklyData.daily?.length > 0 && (
            <div className="card p-4">
              <h2 className="section-title mb-4">Daily Trend (Last 7 Days)</h2>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={weeklyData.daily}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickFormatter={d => format(new Date(d), 'dd MMM')} tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="calls" name="Calls" fill="#0F6E56" />
                  <Bar dataKey="orders" name="Orders" fill="#f59e0b" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="card overflow-hidden">
            <div className="p-4 border-b border-gray-100 dark:border-gray-800"><h2 className="section-title">By Caller</h2></div>
            <table className="w-full">
              <thead><tr>{['Caller','Calls','Connected','Orders','Revenue'].map(h => <th key={h} className="table-header">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {weeklyData.byUser?.map(r => (
                  <tr key={r.name}>
                    <td className="table-cell font-medium">{r.name}</td>
                    <td className="table-cell">{r.total_calls}</td>
                    <td className="table-cell">{r.connected_calls}</td>
                    <td className="table-cell text-green-600 dark:text-green-400 font-medium">{r.orders}</td>
                    <td className="table-cell text-green-600 dark:text-green-400 font-medium">{rupee(r.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Monthly Report */}
      {!loading && tab === 'monthly' && monthlyData && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard title="Total Calls" value={monthlyData.totals?.total_calls || 0} color="primary" icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>} />
            <KpiCard title="Orders" value={monthlyData.totals?.orders || 0} color="green" icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>} />
            <KpiCard title="Revenue" value={rupee(monthlyData.totals?.revenue)} color="amber" icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
            <KpiCard title="Conversion" value={`${monthlyData.totals?.conversion_rate || 0}%`} color="blue" icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>} />
          </div>
          <div className="card overflow-hidden">
            <div className="p-4 border-b border-gray-100 dark:border-gray-800"><h2 className="section-title">Monthly Performance by Caller</h2></div>
            <table className="w-full">
              <thead><tr>{['Caller','Days Worked','Calls','Connected','Orders','Revenue','Late Days'].map(h => <th key={h} className="table-header">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {monthlyData.byUser?.map(r => (
                  <tr key={r.name}>
                    <td className="table-cell font-medium">{r.name}</td>
                    <td className="table-cell">{r.days_worked}</td>
                    <td className="table-cell">{r.total_calls}</td>
                    <td className="table-cell">{r.connected_calls}</td>
                    <td className="table-cell text-green-600 dark:text-green-400 font-medium">{r.orders}</td>
                    <td className="table-cell text-green-600 dark:text-green-400 font-medium">{rupee(r.revenue)}</td>
                    <td className="table-cell">{r.late_days > 0 ? <Badge variant="red">{r.late_days}</Badge> : '0'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Leaderboard */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="section-title">🏆 Leaderboard</h2>
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
            {['daily', 'weekly', 'monthly'].map(p => (
              <button key={p} onClick={() => setLeaderPeriod(p)} className={`px-3 py-1 rounded text-xs font-medium capitalize transition-colors ${leaderPeriod === p ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500'}`}>{p}</button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          {leaderboard.map((item, idx) => (
            <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${idx === 0 ? 'bg-amber-400 text-white' : idx === 1 ? 'bg-gray-400 text-white' : idx === 2 ? 'bg-amber-700 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}>
                {idx + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-gray-800 dark:text-gray-200">{item.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{item.total_calls} calls · {item.orders} orders · {item.conversion_rate}% conv</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-bold text-green-600 dark:text-green-400">{rupee(item.revenue)}</p>
              </div>
            </div>
          ))}
          {!leaderboard.length && <p className="text-center text-gray-400 py-6 text-sm">No data for this period</p>}
        </div>
      </div>
    </div>
  );
}
