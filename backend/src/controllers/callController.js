const { query } = require('../db');
const { log } = require('../utils/activityLogger');

const getCalls = async (req, res) => {
  try {
    const { callerId, startDate, endDate, leadId } = req.query;

    const conditions = [];
    const params = [];
    let paramIdx = 1;

    if (req.user.role === 'caller') {
      conditions.push(`c.caller_id = $${paramIdx++}`);
      params.push(req.user.id);
    } else if (callerId) {
      conditions.push(`c.caller_id = $${paramIdx++}`);
      params.push(callerId);
    }

    if (leadId) {
      conditions.push(`c.lead_id = $${paramIdx++}`);
      params.push(leadId);
    }

    if (startDate) {
      conditions.push(`c.call_date >= $${paramIdx++}`);
      params.push(startDate);
    }

    if (endDate) {
      conditions.push(`c.call_date <= $${paramIdx++}`);
      params.push(endDate);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query(
      `SELECT c.*, l.name as lead_name, l.phone_number, u.name as caller_name
       FROM calls c
       LEFT JOIN leads l ON c.lead_id = l.id
       LEFT JOIN users u ON c.caller_id = u.id
       ${where}
       ORDER BY c.call_date DESC, c.call_time DESC
       LIMIT 200`,
      params
    );

    res.json({ calls: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const logCall = async (req, res) => {
  try {
    const { lead_id, duration, outcome, recording_link, notes } = req.body;

    if (!lead_id) return res.status(400).json({ error: 'Lead ID required' });

    const now = new Date();
    const call_date = now.toISOString().split('T')[0];
    const call_time = now.toTimeString().split(' ')[0];

    const result = await query(
      `INSERT INTO calls (lead_id, caller_id, call_date, call_time, duration, outcome, recording_link, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [lead_id, req.user.id, call_date, call_time, duration || 0, outcome, recording_link, notes]
    );

    await query(
      `UPDATE leads SET
         call_date = $1,
         call_time = $2,
         call_duration = $3,
         updated_at = NOW()
       WHERE id = $4`,
      [call_date, call_time, duration || 0, lead_id]
    );

    await updatePerformanceMetrics(req.user.id, call_date, duration, outcome);

    res.status(201).json({ call: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const updatePerformanceMetrics = async (callerId, date, duration, outcome) => {
  try {
    const isConnected = duration && duration > 0;
    const isOrder = outcome === 'order_confirmed';

    await query(
      `INSERT INTO performance_metrics (user_id, date, calls_attempted, connected_calls, orders_closed)
       VALUES ($1, $2, 1, $3, $4)
       ON CONFLICT (user_id, date) DO UPDATE SET
         calls_attempted = performance_metrics.calls_attempted + 1,
         connected_calls = performance_metrics.connected_calls + $3,
         orders_closed = performance_metrics.orders_closed + $4,
         updated_at = NOW()`,
      [callerId, date, isConnected ? 1 : 0, isOrder ? 1 : 0]
    );
  } catch (err) {
    console.error('Metrics update error:', err.message);
  }
};

const getCallerStats = async (req, res) => {
  try {
    const { callerId, date } = req.query;
    const userId = req.user.role === 'caller' ? req.user.id : callerId;
    const today = date || new Date().toISOString().split('T')[0];

    const stats = await query(
      `SELECT
         COUNT(c.id) as calls_attempted,
         COUNT(CASE WHEN c.duration > 0 THEN 1 END) as connected_calls,
         COALESCE(AVG(CASE WHEN c.duration > 0 THEN c.duration END), 0) as avg_call_duration,
         COUNT(DISTINCT CASE WHEN f.id IS NOT NULL THEN f.id END) as follow_ups_scheduled,
         COUNT(CASE WHEN l.status = 'order_confirmed' THEN 1 END) as orders_closed,
         COALESCE(SUM(CASE WHEN l.status = 'order_confirmed' THEN l.order_value ELSE 0 END), 0) as revenue_generated
       FROM calls c
       LEFT JOIN leads l ON c.lead_id = l.id
       LEFT JOIN follow_ups f ON f.lead_id = c.lead_id AND f.caller_id = c.caller_id AND DATE(f.created_at) = $2
       WHERE c.caller_id = $1 AND c.call_date = $2`,
      [userId, today]
    );

    const s = stats.rows[0];
    const conversionRate = s.calls_attempted > 0
      ? ((s.orders_closed / s.calls_attempted) * 100).toFixed(2)
      : 0;

    res.json({ stats: { ...s, conversion_rate: parseFloat(conversionRate), date: today } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getTeamStats = async (req, res) => {
  try {
    const { date } = req.query;
    const today = date || new Date().toISOString().split('T')[0];

    const perCaller = await query(
      `SELECT u.id, u.name,
         COALESCE(a.status, 'offline') as attendance_status,
         a.login_time,
         a.logout_time,
         COUNT(c.id) as calls_attempted,
         COUNT(CASE WHEN c.duration > 0 THEN 1 END) as connected_calls,
         COUNT(CASE WHEN l.status = 'order_confirmed' THEN 1 END) as orders_closed,
         COALESCE(SUM(CASE WHEN l.status = 'order_confirmed' THEN l.order_value ELSE 0 END), 0) as revenue,
         COUNT(DISTINCT CASE WHEN fu.is_completed = false THEN fu.id END) as pending_followups
       FROM users u
       LEFT JOIN attendance a ON a.user_id = u.id AND a.date = $1
       LEFT JOIN calls c ON c.caller_id = u.id AND c.call_date = $1
       LEFT JOIN leads l ON c.lead_id = l.id
       LEFT JOIN follow_ups fu ON fu.caller_id = u.id AND fu.scheduled_date = $1
       WHERE u.role = 'caller' AND u.is_active = true
       GROUP BY u.id, u.name, a.status, a.login_time, a.logout_time
       ORDER BY u.name`,
      [today]
    );

    const totals = perCaller.rows.reduce((acc, r) => ({
      total_calls: acc.total_calls + parseInt(r.calls_attempted),
      connected_calls: acc.connected_calls + parseInt(r.connected_calls),
      orders: acc.orders + parseInt(r.orders_closed),
      revenue: acc.revenue + parseFloat(r.revenue),
    }), { total_calls: 0, connected_calls: 0, orders: 0, revenue: 0 });

    totals.conversion_rate = totals.total_calls > 0
      ? ((totals.orders / totals.total_calls) * 100).toFixed(2)
      : 0;

    res.json({ callers: perCaller.rows, totals, date: today });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getTrends = async (req, res) => {
  try {
    const { period = 'weekly', callerId } = req.query;
    let interval = '7 days';
    if (period === 'monthly') interval = '30 days';

    const conditions = callerId ? `AND c.caller_id = $2` : '';
    const params = callerId ? [interval, callerId] : [interval];

    const result = await query(
      `SELECT c.call_date::text as date,
         COUNT(c.id) as calls,
         COUNT(CASE WHEN c.duration > 0 THEN 1 END) as connected,
         COUNT(CASE WHEN l.status = 'order_confirmed' THEN 1 END) as orders,
         COALESCE(SUM(CASE WHEN l.status = 'order_confirmed' THEN l.order_value ELSE 0 END), 0) as revenue
       FROM calls c
       LEFT JOIN leads l ON c.lead_id = l.id
       WHERE c.call_date >= CURRENT_DATE - $1::interval
         ${conditions}
       GROUP BY c.call_date
       ORDER BY c.call_date`,
      params
    );

    res.json({ trends: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { getCalls, logCall, getCallerStats, getTeamStats, getTrends };
