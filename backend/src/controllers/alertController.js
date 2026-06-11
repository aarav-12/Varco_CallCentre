const { query } = require('../db');
const { getPagination, paginatedResponse } = require('../utils/pagination');

const getAlerts = async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query);
    const { isRead, isResolved, severity, userId } = req.query;

    const conditions = [];
    const params = [];
    let paramIdx = 1;

    if (isRead !== undefined) {
      conditions.push(`a.is_read = $${paramIdx++}`);
      params.push(isRead === 'true');
    }

    if (isResolved !== undefined) {
      conditions.push(`a.is_resolved = $${paramIdx++}`);
      params.push(isResolved === 'true');
    }

    if (severity) {
      conditions.push(`a.severity = $${paramIdx++}`);
      params.push(severity);
    }

    if (userId && req.user.role === 'manager') {
      conditions.push(`a.user_id = $${paramIdx++}`);
      params.push(userId);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await query(
      `SELECT COUNT(*) FROM alerts a ${where}`,
      params
    );

    const result = await query(
      `SELECT a.*, u.name as user_name FROM alerts a
       LEFT JOIN users u ON a.user_id = u.id
       ${where}
       ORDER BY a.created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset]
    );

    res.json(paginatedResponse(result.rows, parseInt(countResult.rows[0].count), page, limit));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getUnreadCount = async (req, res) => {
  try {
    const result = await query(
      'SELECT COUNT(*) FROM alerts WHERE is_read = false AND is_resolved = false'
    );
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    await query(
      'UPDATE alerts SET is_read = true, updated_at = NOW() WHERE id = $1',
      [id]
    );
    res.json({ message: 'Alert marked as read' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const markAllRead = async (req, res) => {
  try {
    await query('UPDATE alerts SET is_read = true, updated_at = NOW() WHERE is_read = false');
    res.json({ message: 'All alerts marked as read' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const resolveAlert = async (req, res) => {
  try {
    const { id } = req.params;
    await query(
      'UPDATE alerts SET is_resolved = true, is_read = true, updated_at = NOW() WHERE id = $1',
      [id]
    );
    res.json({ message: 'Alert resolved' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { getAlerts, getUnreadCount, markAsRead, markAllRead, resolveAlert };
