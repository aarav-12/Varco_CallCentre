const { query } = require('../db');
const { log } = require('../utils/activityLogger');

const LATE_HOUR = 9;
const LATE_MINUTE = 5;

const loginShift = async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    const existing = await query(
      'SELECT * FROM attendance WHERE user_id = $1 AND date = $2',
      [userId, today]
    );

    if (existing.rows.length && existing.rows[0].login_time) {
      return res.status(400).json({ error: 'Already logged in for today' });
    }

    const isLate = now.getHours() > LATE_HOUR ||
      (now.getHours() === LATE_HOUR && now.getMinutes() >= LATE_MINUTE);

    const status = isLate ? 'late' : 'online';

    let attendance;
    if (existing.rows.length) {
      const result = await query(
        `UPDATE attendance SET login_time = $1, status = $2, is_late = $3, updated_at = NOW()
         WHERE user_id = $4 AND date = $5
         RETURNING *`,
        [now, status, isLate, userId, today]
      );
      attendance = result.rows[0];
    } else {
      const result = await query(
        `INSERT INTO attendance (user_id, date, login_time, status, is_late)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [userId, today, now, status, isLate]
      );
      attendance = result.rows[0];
    }

    if (isLate) {
      const { createAlert } = require('../services/alertService');
      await createAlert({
        type: 'late_login',
        title: 'Late Login',
        message: `${req.user.name} logged in late at ${now.toLocaleTimeString()}`,
        userId,
        severity: 'warning',
      });
    }

    await log({
      userId,
      action: 'SHIFT_LOGIN',
      entityType: 'attendance',
      entityId: attendance.id,
      newValue: { loginTime: now, isLate },
      ipAddress: req.ip,
    });

    res.json({ attendance, message: isLate ? 'Logged in (Late)' : 'Logged in successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const logoutShift = async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    const existing = await query(
      'SELECT * FROM attendance WHERE user_id = $1 AND date = $2',
      [userId, today]
    );

    if (!existing.rows.length || !existing.rows[0].login_time) {
      return res.status(400).json({ error: 'No active shift found' });
    }

    const att = existing.rows[0];
    const loginTime = new Date(att.login_time);
    const totalWorkingMs = now - loginTime;
    const totalWorkingMinutes = Math.floor(totalWorkingMs / 60000) - (att.total_break_minutes || 0);

    const result = await query(
      `UPDATE attendance SET
         logout_time = $1,
         total_working_minutes = $2,
         status = 'offline',
         updated_at = NOW()
       WHERE user_id = $3 AND date = $4
       RETURNING *`,
      [now, Math.max(0, totalWorkingMinutes), userId, today]
    );

    await log({
      userId,
      action: 'SHIFT_LOGOUT',
      entityType: 'attendance',
      entityId: att.id,
      newValue: { logoutTime: now, totalWorkingMinutes },
      ipAddress: req.ip,
    });

    res.json({ attendance: result.rows[0], message: 'Logged out successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const startBreak = async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    const existing = await query(
      'SELECT * FROM attendance WHERE user_id = $1 AND date = $2',
      [userId, today]
    );

    if (!existing.rows.length || !existing.rows[0].login_time) {
      return res.status(400).json({ error: 'No active shift found' });
    }

    if (existing.rows[0].status === 'on_break') {
      return res.status(400).json({ error: 'Already on break' });
    }

    const result = await query(
      `UPDATE attendance SET status = 'on_break', updated_at = NOW()
       WHERE user_id = $1 AND date = $2
       RETURNING *`,
      [userId, today]
    );

    await query(
      `UPDATE attendance SET break_start_temp = $1 WHERE user_id = $2 AND date = $3`,
      [now, userId, today]
    ).catch(() => {});

    res.json({ attendance: result.rows[0], breakStartTime: now, message: 'Break started' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const endBreak = async (req, res) => {
  try {
    const userId = req.user.id;
    const { breakStartTime } = req.body;
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    const existing = await query(
      'SELECT * FROM attendance WHERE user_id = $1 AND date = $2',
      [userId, today]
    );

    if (!existing.rows.length || existing.rows[0].status !== 'on_break') {
      return res.status(400).json({ error: 'Not currently on break' });
    }

    const att = existing.rows[0];
    const breakStart = breakStartTime ? new Date(breakStartTime) : new Date(now - 15 * 60000);
    const breakDurationMinutes = Math.floor((now - breakStart) / 60000);
    const totalBreakMinutes = (att.total_break_minutes || 0) + breakDurationMinutes;

    const isLate = att.is_late;
    const status = isLate ? 'late' : 'online';

    const result = await query(
      `UPDATE attendance SET
         status = $1,
         total_break_minutes = $2,
         updated_at = NOW()
       WHERE user_id = $3 AND date = $4
       RETURNING *`,
      [status, totalBreakMinutes, userId, today]
    );

    res.json({ attendance: result.rows[0], message: 'Break ended' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getTodayAttendance = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const result = await query(
      `SELECT a.*, u.name, u.email FROM attendance a
       JOIN users u ON a.user_id = u.id
       WHERE a.date = $1 AND u.role = 'caller'
       ORDER BY u.name`,
      [today]
    );
    res.json({ attendance: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getMyAttendance = async (req, res) => {
  try {
    const userId = req.user.id;
    const { month, year } = req.query;
    const today = new Date();
    const m = parseInt(month) || today.getMonth() + 1;
    const y = parseInt(year) || today.getFullYear();

    const result = await query(
      `SELECT * FROM attendance
       WHERE user_id = $1
         AND EXTRACT(MONTH FROM date) = $2
         AND EXTRACT(YEAR FROM date) = $3
       ORDER BY date DESC`,
      [userId, m, y]
    );

    res.json({ attendance: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getMyTodayStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date().toISOString().split('T')[0];
    const result = await query(
      'SELECT * FROM attendance WHERE user_id = $1 AND date = $2',
      [userId, today]
    );
    res.json({ attendance: result.rows[0] || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { loginShift, logoutShift, startBreak, endBreak, getTodayAttendance, getMyAttendance, getMyTodayStatus };
