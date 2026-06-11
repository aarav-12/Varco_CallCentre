const { query } = require('../db');

const createAlert = async ({ type, title, message, userId, severity = 'info' }) => {
  try {
    const result = await query(
      `INSERT INTO alerts (type, title, message, user_id, severity)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [type, title, message, userId || null, severity]
    );
    return result.rows[0];
  } catch (err) {
    console.error('Create alert error:', err.message);
  }
};

const checkAndGenerateAlerts = async () => {
  try {
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    // Check calls below 80 by 2 PM
    if (now.getHours() >= 14) {
      const lowCallCallers = await query(`
        SELECT u.id, u.name, COUNT(c.id) as call_count
        FROM users u
        LEFT JOIN calls c ON c.caller_id = u.id AND c.call_date = $1
        WHERE u.role = 'caller' AND u.is_active = true
        GROUP BY u.id, u.name
        HAVING COUNT(c.id) < 80
      `, [today]);

      for (const caller of lowCallCallers.rows) {
        const existing = await query(
          `SELECT id FROM alerts WHERE user_id = $1 AND type = 'low_calls' AND DATE(created_at) = $2`,
          [caller.id, today]
        );
        if (!existing.rows.length) {
          await createAlert({
            type: 'low_calls',
            title: 'Low Call Count',
            message: `${caller.name} has only made ${caller.call_count} calls by 2 PM (target: 80+)`,
            userId: caller.id,
            severity: 'warning',
          });
        }
      }
    }

    // Check conversion rate below 15%
    const conversionCheck = await query(`
      SELECT u.id, u.name,
        COUNT(c.id) as total_calls,
        COUNT(CASE WHEN l.status = 'order_confirmed' THEN 1 END) as orders
      FROM users u
      LEFT JOIN calls c ON c.caller_id = u.id AND c.call_date = $1
      LEFT JOIN leads l ON l.assigned_to = u.id
      WHERE u.role = 'caller' AND u.is_active = true
      GROUP BY u.id, u.name
      HAVING COUNT(c.id) > 10
    `, [today]);

    for (const caller of conversionCheck.rows) {
      const rate = (caller.orders / caller.total_calls) * 100;
      if (rate < 15) {
        const existing = await query(
          `SELECT id FROM alerts WHERE user_id = $1 AND type = 'low_conversion' AND DATE(created_at) = $2`,
          [caller.id, today]
        );
        if (!existing.rows.length) {
          await createAlert({
            type: 'low_conversion',
            title: 'Low Conversion Rate',
            message: `${caller.name}'s conversion rate is ${rate.toFixed(1)}% (target: 15%+)`,
            userId: caller.id,
            severity: 'warning',
          });
        }
      }
    }

    // Check overdue follow-ups
    const overdueFollowups = await query(`
      SELECT f.caller_id, u.name, COUNT(*) as count
      FROM follow_ups f
      JOIN users u ON f.caller_id = u.id
      WHERE f.scheduled_date < $1 AND f.is_completed = false
      GROUP BY f.caller_id, u.name
    `, [today]);

    for (const item of overdueFollowups.rows) {
      const existing = await query(
        `SELECT id FROM alerts WHERE user_id = $1 AND type = 'overdue_followups' AND DATE(created_at) = $2`,
        [item.caller_id, today]
      );
      if (!existing.rows.length) {
        await createAlert({
          type: 'overdue_followups',
          title: 'Overdue Follow-Ups',
          message: `${item.name} has ${item.count} overdue follow-up(s)`,
          userId: item.caller_id,
          severity: 'critical',
        });
      }
    }

    // Check callers inactive for 45+ minutes
    const inactiveCallers = await query(`
      SELECT u.id, u.name, a.login_time
      FROM attendance a
      JOIN users u ON a.user_id = u.id
      WHERE a.date = $1 AND a.status = 'online'
        AND a.login_time < NOW() - INTERVAL '45 minutes'
      AND NOT EXISTS (
        SELECT 1 FROM calls c WHERE c.caller_id = u.id
          AND c.call_date = $1
          AND c.created_at > NOW() - INTERVAL '45 minutes'
      )
    `, [today]);

    for (const caller of inactiveCallers.rows) {
      const existing = await query(
        `SELECT id FROM alerts WHERE user_id = $1 AND type = 'inactive' AND created_at > NOW() - INTERVAL '1 hour'`,
        [caller.id]
      );
      if (!existing.rows.length) {
        await createAlert({
          type: 'inactive',
          title: 'Caller Inactive',
          message: `${caller.name} has been inactive for 45+ minutes`,
          userId: caller.id,
          severity: 'warning',
        });
      }
    }

    // Update follow-up categories
    await query(`
      UPDATE follow_ups SET category =
        CASE
          WHEN scheduled_date < CURRENT_DATE THEN 'red'
          WHEN scheduled_date = CURRENT_DATE THEN 'amber'
          ELSE 'green'
        END
      WHERE is_completed = false
    `);

  } catch (err) {
    console.error('Alert generation error:', err.message);
  }
};

module.exports = { createAlert, checkAndGenerateAlerts };
