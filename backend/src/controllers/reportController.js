const { query } = require('../db');
const { stringify } = require('csv-stringify/sync');
const XLSX = require('xlsx');

const getDailyReport = async (req, res) => {
  try {
    const { date } = req.query;
    const reportDate = date || new Date().toISOString().split('T')[0];

    const attendance = await query(
      `SELECT u.name, a.login_time, a.logout_time, a.total_working_minutes,
              a.total_break_minutes, a.status, a.is_late
       FROM attendance a
       JOIN users u ON a.user_id = u.id
       WHERE a.date = $1 AND u.role = 'caller'
       ORDER BY u.name`,
      [reportDate]
    );

    const calls = await query(
      `SELECT u.name,
         COUNT(c.id) as total_calls,
         COUNT(CASE WHEN c.duration > 0 THEN 1 END) as connected_calls,
         COALESCE(AVG(CASE WHEN c.duration > 0 THEN c.duration END), 0) as avg_duration,
         COUNT(CASE WHEN l.status = 'order_confirmed' THEN 1 END) as orders,
         COALESCE(SUM(CASE WHEN l.status = 'order_confirmed' THEN l.order_value ELSE 0 END), 0) as revenue
       FROM users u
       LEFT JOIN calls c ON c.caller_id = u.id AND c.call_date = $1
       LEFT JOIN leads l ON c.lead_id = l.id
       WHERE u.role = 'caller' AND u.is_active = true
       GROUP BY u.id, u.name
       ORDER BY u.name`,
      [reportDate]
    );

    const followups = await query(
      `SELECT u.name,
         COUNT(CASE WHEN f.scheduled_date = $1 THEN 1 END) as scheduled_today,
         COUNT(CASE WHEN f.scheduled_date = $1 AND f.is_completed = true THEN 1 END) as completed_today,
         COUNT(CASE WHEN f.scheduled_date < $1 AND f.is_completed = false THEN 1 END) as overdue
       FROM users u
       LEFT JOIN follow_ups f ON f.caller_id = u.id
       WHERE u.role = 'caller' AND u.is_active = true
       GROUP BY u.id, u.name
       ORDER BY u.name`,
      [reportDate]
    );

    const totals = calls.rows.reduce((acc, r) => ({
      total_calls: acc.total_calls + parseInt(r.total_calls),
      connected_calls: acc.connected_calls + parseInt(r.connected_calls),
      orders: acc.orders + parseInt(r.orders),
      revenue: acc.revenue + parseFloat(r.revenue),
    }), { total_calls: 0, connected_calls: 0, orders: 0, revenue: 0 });

    totals.conversion_rate = totals.total_calls > 0
      ? ((totals.orders / totals.total_calls) * 100).toFixed(2)
      : 0;

    res.json({
      date: reportDate,
      attendance: attendance.rows,
      calls: calls.rows,
      followups: followups.rows,
      totals,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getWeeklyReport = async (req, res) => {
  try {
    const { startDate } = req.query;
    const start = startDate || new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
    const end = new Date().toISOString().split('T')[0];

    const daily = await query(
      `SELECT c.call_date::text as date,
         COUNT(c.id) as calls,
         COUNT(CASE WHEN c.duration > 0 THEN 1 END) as connected,
         COUNT(CASE WHEN l.status = 'order_confirmed' THEN 1 END) as orders,
         COALESCE(SUM(CASE WHEN l.status = 'order_confirmed' THEN l.order_value ELSE 0 END), 0) as revenue
       FROM calls c
       LEFT JOIN leads l ON c.lead_id = l.id
       WHERE c.call_date BETWEEN $1 AND $2
       GROUP BY c.call_date
       ORDER BY c.call_date`,
      [start, end]
    );

    const byUser = await query(
      `SELECT u.name,
         COUNT(c.id) as total_calls,
         COUNT(CASE WHEN c.duration > 0 THEN 1 END) as connected_calls,
         COUNT(CASE WHEN l.status = 'order_confirmed' THEN 1 END) as orders,
         COALESCE(SUM(CASE WHEN l.status = 'order_confirmed' THEN l.order_value ELSE 0 END), 0) as revenue
       FROM users u
       LEFT JOIN calls c ON c.caller_id = u.id AND c.call_date BETWEEN $1 AND $2
       LEFT JOIN leads l ON c.lead_id = l.id
       WHERE u.role = 'caller' AND u.is_active = true
       GROUP BY u.id, u.name
       ORDER BY revenue DESC`,
      [start, end]
    );

    res.json({ startDate: start, endDate: end, daily: daily.rows, byUser: byUser.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getMonthlyReport = async (req, res) => {
  try {
    const { month, year } = req.query;
    const now = new Date();
    const m = parseInt(month) || now.getMonth() + 1;
    const y = parseInt(year) || now.getFullYear();

    const byUser = await query(
      `SELECT u.name,
         COUNT(c.id) as total_calls,
         COUNT(CASE WHEN c.duration > 0 THEN 1 END) as connected_calls,
         COUNT(DISTINCT c.call_date) as days_worked,
         COUNT(CASE WHEN l.status = 'order_confirmed' THEN 1 END) as orders,
         COALESCE(SUM(CASE WHEN l.status = 'order_confirmed' THEN l.order_value ELSE 0 END), 0) as revenue,
         COALESCE(COUNT(CASE WHEN a.is_late = true THEN 1 END), 0) as late_days
       FROM users u
       LEFT JOIN calls c ON c.caller_id = u.id
         AND EXTRACT(MONTH FROM c.call_date) = $1
         AND EXTRACT(YEAR FROM c.call_date) = $2
       LEFT JOIN leads l ON c.lead_id = l.id
       LEFT JOIN attendance a ON a.user_id = u.id
         AND EXTRACT(MONTH FROM a.date) = $1
         AND EXTRACT(YEAR FROM a.date) = $2
       WHERE u.role = 'caller' AND u.is_active = true
       GROUP BY u.id, u.name
       ORDER BY revenue DESC`,
      [m, y]
    );

    const totals = byUser.rows.reduce((acc, r) => ({
      total_calls: acc.total_calls + parseInt(r.total_calls),
      connected_calls: acc.connected_calls + parseInt(r.connected_calls),
      orders: acc.orders + parseInt(r.orders),
      revenue: acc.revenue + parseFloat(r.revenue),
    }), { total_calls: 0, connected_calls: 0, orders: 0, revenue: 0 });

    totals.conversion_rate = totals.total_calls > 0
      ? ((totals.orders / totals.total_calls) * 100).toFixed(2)
      : 0;

    res.json({ month: m, year: y, byUser: byUser.rows, totals });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const exportReport = async (req, res) => {
  try {
    const { type = 'daily', format = 'csv', date, month, year } = req.query;
    let reportDate = date || new Date().toISOString().split('T')[0];

    const result = await query(
      `SELECT u.name,
         COUNT(c.id) as total_calls,
         COUNT(CASE WHEN c.duration > 0 THEN 1 END) as connected_calls,
         COUNT(CASE WHEN l.status = 'order_confirmed' THEN 1 END) as orders,
         COALESCE(SUM(CASE WHEN l.status = 'order_confirmed' THEN l.order_value ELSE 0 END), 0) as revenue
       FROM users u
       LEFT JOIN calls c ON c.caller_id = u.id AND c.call_date = $1
       LEFT JOIN leads l ON c.lead_id = l.id
       WHERE u.role = 'caller'
       GROUP BY u.id, u.name`,
      [reportDate]
    );

    if (format === 'xlsx') {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(result.rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Report');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="report-${reportDate}.xlsx"`);
      return res.send(buf);
    }

    const csv = stringify(result.rows, { header: true });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="report-${reportDate}.csv"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getLeaderboard = async (req, res) => {
  try {
    const { period = 'daily', date } = req.query;
    const today = date || new Date().toISOString().split('T')[0];

    let dateCondition = `c.call_date = '${today}'`;
    if (period === 'weekly') dateCondition = `c.call_date >= CURRENT_DATE - INTERVAL '7 days'`;
    if (period === 'monthly') dateCondition = `EXTRACT(MONTH FROM c.call_date) = EXTRACT(MONTH FROM CURRENT_DATE) AND EXTRACT(YEAR FROM c.call_date) = EXTRACT(YEAR FROM CURRENT_DATE)`;

    const result = await query(
      `SELECT u.id, u.name,
         COUNT(c.id) as total_calls,
         COUNT(CASE WHEN l.status = 'order_confirmed' THEN 1 END) as orders,
         COALESCE(SUM(CASE WHEN l.status = 'order_confirmed' THEN l.order_value ELSE 0 END), 0) as revenue,
         CASE WHEN COUNT(c.id) > 0
           THEN ROUND((COUNT(CASE WHEN l.status = 'order_confirmed' THEN 1 END)::numeric / COUNT(c.id)) * 100, 2)
           ELSE 0 END as conversion_rate
       FROM users u
       LEFT JOIN calls c ON c.caller_id = u.id AND ${dateCondition}
       LEFT JOIN leads l ON c.lead_id = l.id
       WHERE u.role = 'caller' AND u.is_active = true
       GROUP BY u.id, u.name
       ORDER BY revenue DESC`,
      []
    );

    res.json({ leaderboard: result.rows, period });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { getDailyReport, getWeeklyReport, getMonthlyReport, exportReport, getLeaderboard };
