const { query } = require('../db');
const { log } = require('../utils/activityLogger');
const { getPagination, paginatedResponse } = require('../utils/pagination');

const getFollowUps = async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query);
    const { category, callerId, startDate, endDate, isCompleted, search } = req.query;

    const conditions = [];
    const params = [];
    let paramIdx = 1;

    if (req.user.role === 'caller') {
      conditions.push(`f.caller_id = $${paramIdx++}`);
      params.push(req.user.id);
    } else if (callerId) {
      conditions.push(`f.caller_id = $${paramIdx++}`);
      params.push(callerId);
    }

    if (category) {
      conditions.push(`f.category = $${paramIdx++}`);
      params.push(category);
    }

    if (isCompleted !== undefined) {
      conditions.push(`f.is_completed = $${paramIdx++}`);
      params.push(isCompleted === 'true');
    }

    if (startDate) {
      conditions.push(`f.scheduled_date >= $${paramIdx++}`);
      params.push(startDate);
    }

    if (endDate) {
      conditions.push(`f.scheduled_date <= $${paramIdx++}`);
      params.push(endDate);
    }

    if (search) {
      conditions.push(`(l.name ILIKE $${paramIdx} OR l.phone_number ILIKE $${paramIdx})`);
      params.push(`%${search}%`);
      paramIdx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await query(
      `SELECT COUNT(*) FROM follow_ups f
       LEFT JOIN leads l ON f.lead_id = l.id ${where}`,
      params
    );

    const result = await query(
      `SELECT f.*, l.name as lead_name, l.phone_number, l.status as lead_status,
              u.name as caller_name
       FROM follow_ups f
       LEFT JOIN leads l ON f.lead_id = l.id
       LEFT JOIN users u ON f.caller_id = u.id
       ${where}
       ORDER BY f.scheduled_date ASC, f.scheduled_time ASC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset]
    );

    res.json(paginatedResponse(result.rows, parseInt(countResult.rows[0].count), page, limit));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getTodayFollowUps = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    const conditions = req.user.role === 'caller'
      ? 'AND f.caller_id = $3'
      : '';
    const params = req.user.role === 'caller'
      ? [today, tomorrow, req.user.id]
      : [today, tomorrow];

    const result = await query(
      `SELECT f.*, l.name as lead_name, l.phone_number, l.status as lead_status,
              u.name as caller_name
       FROM follow_ups f
       LEFT JOIN leads l ON f.lead_id = l.id
       LEFT JOIN users u ON f.caller_id = u.id
       WHERE f.scheduled_date <= $2 AND f.is_completed = false
         ${conditions}
       ORDER BY f.category ASC, f.scheduled_date ASC`,
      params
    );

    const grouped = { red: [], amber: [], green: [] };
    for (const fu of result.rows) {
      if (fu.category in grouped) grouped[fu.category].push(fu);
    }

    res.json({ followUps: result.rows, grouped });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const createFollowUp = async (req, res) => {
  try {
    const { lead_id, scheduled_date, scheduled_time, notes } = req.body;

    if (!lead_id || !scheduled_date) {
      return res.status(400).json({ error: 'Lead ID and scheduled date are required' });
    }

    const lead = await query('SELECT * FROM leads WHERE id = $1', [lead_id]);
    if (!lead.rows.length) return res.status(404).json({ error: 'Lead not found' });

    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    let category = 'green';
    if (scheduled_date < today) category = 'red';
    else if (scheduled_date === today) category = 'amber';
    else if (scheduled_date === tomorrow) category = 'green';

    const callerId = req.user.role === 'caller' ? req.user.id : (lead.rows[0].assigned_to || req.user.id);

    const result = await query(
      `INSERT INTO follow_ups (lead_id, caller_id, scheduled_date, scheduled_time, notes, category)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [lead_id, callerId, scheduled_date, scheduled_time, notes, category]
    );

    await query(
      `UPDATE leads SET follow_up_date = $1, status = 'follow_up_required', updated_at = NOW()
       WHERE id = $2`,
      [scheduled_date, lead_id]
    );

    await log({
      userId: req.user.id,
      action: 'FOLLOWUP_CREATED',
      entityType: 'follow_up',
      entityId: result.rows[0].id,
      newValue: { lead_id, scheduled_date },
      ipAddress: req.ip,
    });

    res.status(201).json({ followUp: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const completeFollowUp = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      `UPDATE follow_ups SET is_completed = true, completed_at = NOW(), updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id]
    );

    if (!result.rows.length) return res.status(404).json({ error: 'Follow-up not found' });

    await log({
      userId: req.user.id,
      action: 'FOLLOWUP_COMPLETED',
      entityType: 'follow_up',
      entityId: id,
      ipAddress: req.ip,
    });

    res.json({ followUp: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { getFollowUps, getTodayFollowUps, createFollowUp, completeFollowUp };
