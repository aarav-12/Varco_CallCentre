const { query } = require('../db');
const { getPagination, paginatedResponse } = require('../utils/pagination');
const { stringify } = require('csv-stringify/sync');
const XLSX = require('xlsx');

const getLogs = async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query);
    const { userId, action, entityType, startDate, endDate, search } = req.query;

    const conditions = [];
    const params = [];
    let paramIdx = 1;

    if (userId) {
      conditions.push(`al.user_id = $${paramIdx++}`);
      params.push(userId);
    }

    if (action) {
      conditions.push(`al.action = $${paramIdx++}`);
      params.push(action);
    }

    if (entityType) {
      conditions.push(`al.entity_type = $${paramIdx++}`);
      params.push(entityType);
    }

    if (startDate) {
      conditions.push(`al.created_at >= $${paramIdx++}`);
      params.push(startDate);
    }

    if (endDate) {
      conditions.push(`al.created_at <= $${paramIdx++}::date + interval '1 day'`);
      params.push(endDate);
    }

    if (search) {
      conditions.push(`(u.name ILIKE $${paramIdx} OR al.action ILIKE $${paramIdx})`);
      params.push(`%${search}%`);
      paramIdx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await query(
      `SELECT COUNT(*) FROM activity_logs al LEFT JOIN users u ON al.user_id = u.id ${where}`,
      params
    );

    const result = await query(
      `SELECT al.*, u.name as user_name, u.role as user_role
       FROM activity_logs al
       LEFT JOIN users u ON al.user_id = u.id
       ${where}
       ORDER BY al.created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset]
    );

    res.json(paginatedResponse(result.rows, parseInt(countResult.rows[0].count), page, limit));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const exportLogs = async (req, res) => {
  try {
    const { format = 'csv', startDate, endDate } = req.query;

    const conditions = [];
    const params = [];
    let paramIdx = 1;

    if (startDate) {
      conditions.push(`al.created_at >= $${paramIdx++}`);
      params.push(startDate);
    }

    if (endDate) {
      conditions.push(`al.created_at <= $${paramIdx++}::date + interval '1 day'`);
      params.push(endDate);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query(
      `SELECT u.name as user_name, u.role, al.action, al.entity_type,
              al.ip_address, al.created_at
       FROM activity_logs al
       LEFT JOIN users u ON al.user_id = u.id
       ${where}
       ORDER BY al.created_at DESC
       LIMIT 10000`,
      params
    );

    if (format === 'xlsx') {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(result.rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Activity Logs');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="activity-logs.xlsx"');
      return res.send(buf);
    }

    const csv = stringify(result.rows, { header: true });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="activity-logs.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { getLogs, exportLogs };
