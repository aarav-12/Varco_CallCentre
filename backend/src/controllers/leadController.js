const { query } = require('../db');
const { log } = require('../utils/activityLogger');
const { getPagination, paginatedResponse } = require('../utils/pagination');
const { getNextRoundRobinCaller, assignLeadToUser } = require('../services/leadAssignmentService');
const { stringify } = require('csv-stringify/sync');
const { parse } = require('csv-parse/sync');
const XLSX = require('xlsx');

const getLeads = async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query);
    const {
      search, status, assignedTo, source, followUpDate,
      startDate, endDate, sortBy = 'created_at', sortOrder = 'desc'
    } = req.query;

    const conditions = [];
    const params = [];
    let paramIdx = 1;

    if (req.user.role === 'caller') {
      conditions.push(`l.assigned_to = $${paramIdx++}`);
      params.push(req.user.id);
    }

    if (search) {
      conditions.push(`(l.name ILIKE $${paramIdx} OR l.phone_number ILIKE $${paramIdx})`);
      params.push(`%${search}%`);
      paramIdx++;
    }

    if (status) {
      conditions.push(`l.status = $${paramIdx++}`);
      params.push(status);
    }

    if (assignedTo && req.user.role === 'manager') {
      conditions.push(`l.assigned_to = $${paramIdx++}`);
      params.push(assignedTo);
    }

    if (source) {
      conditions.push(`l.source ILIKE $${paramIdx++}`);
      params.push(`%${source}%`);
    }

    if (followUpDate) {
      conditions.push(`l.follow_up_date = $${paramIdx++}`);
      params.push(followUpDate);
    }

    if (startDate) {
      conditions.push(`l.created_at >= $${paramIdx++}`);
      params.push(startDate);
    }

    if (endDate) {
      conditions.push(`l.created_at <= $${paramIdx++}::date + interval '1 day'`);
      params.push(endDate);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const allowedSort = ['name', 'created_at', 'updated_at', 'status', 'follow_up_date', 'order_value', 'call_date'];
    const safeSort = allowedSort.includes(sortBy) ? `l.${sortBy}` : 'l.created_at';
    const safeOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';

    const countResult = await query(
      `SELECT COUNT(*) FROM leads l ${where}`,
      params
    );

    const dataResult = await query(
      `SELECT l.*, u.name as assigned_to_name, cb.name as created_by_name
       FROM leads l
       LEFT JOIN users u ON l.assigned_to = u.id
       LEFT JOIN users cb ON l.created_by = cb.id
       ${where}
       ORDER BY ${safeSort} ${safeOrder}
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset]
    );

    res.json(paginatedResponse(dataResult.rows, parseInt(countResult.rows[0].count), page, limit));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getLeadById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT l.*, u.name as assigned_to_name, cb.name as created_by_name
       FROM leads l
       LEFT JOIN users u ON l.assigned_to = u.id
       LEFT JOIN users cb ON l.created_by = cb.id
       WHERE l.id = $1`,
      [id]
    );

    if (!result.rows.length) return res.status(404).json({ error: 'Lead not found' });

    if (req.user.role === 'caller' && result.rows[0].assigned_to !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const notes = await query(
      `SELECT ln.*, u.name as user_name FROM lead_notes ln
       JOIN users u ON ln.user_id = u.id
       WHERE ln.lead_id = $1 ORDER BY ln.created_at DESC`,
      [id]
    );

    const followUps = await query(
      'SELECT * FROM follow_ups WHERE lead_id = $1 ORDER BY scheduled_date',
      [id]
    );

    const callHistory = await query(
      `SELECT c.*, u.name as caller_name FROM calls c
       LEFT JOIN users u ON c.caller_id = u.id
       WHERE c.lead_id = $1 ORDER BY c.call_date DESC, c.call_time DESC`,
      [id]
    );

    const assignments = await query(
      `SELECT la.*, u.name as assigned_to_name, ab.name as assigned_by_name
       FROM lead_assignments la
       LEFT JOIN users u ON la.assigned_to = u.id
       LEFT JOIN users ab ON la.assigned_by = ab.id
       WHERE la.lead_id = $1 ORDER BY la.created_at DESC`,
      [id]
    );

    res.json({
      lead: result.rows[0],
      notes: notes.rows,
      followUps: followUps.rows,
      callHistory: callHistory.rows,
      assignments: assignments.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const createLead = async (req, res) => {
  try {
    const {
      name, phone_number, source, assigned_to,
      call_date, call_time, notes, follow_up_date,
      order_value, assignment_type = 'manual'
    } = req.body;

    if (!name || !phone_number) {
      return res.status(400).json({ error: 'Name and phone number are required' });
    }

    let callerId = assigned_to;
    let actualAssignmentType = assignment_type;

    if (!callerId) {
      callerId = await getNextRoundRobinCaller();
      actualAssignmentType = 'round_robin';
    }

    const result = await query(
      `INSERT INTO leads (name, phone_number, source, assigned_to, call_date, call_time,
         notes, follow_up_date, order_value, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [name.trim(), phone_number.trim(), source, callerId, call_date, call_time,
        notes, follow_up_date, order_value || 0, req.user.id]
    );

    const lead = result.rows[0];

    await query(
      `INSERT INTO lead_assignments (lead_id, assigned_to, assigned_by, assignment_type)
       VALUES ($1, $2, $3, $4)`,
      [lead.id, callerId, req.user.id, actualAssignmentType]
    );

    await log({
      userId: req.user.id,
      action: 'LEAD_CREATED',
      entityType: 'lead',
      entityId: lead.id,
      newValue: { name, phone_number, assigned_to: callerId },
      ipAddress: req.ip,
    });

    res.status(201).json({ lead });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const updateLead = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await query('SELECT * FROM leads WHERE id = $1', [id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Lead not found' });

    const old = existing.rows[0];

    if (req.user.role === 'caller') {
      if (old.assigned_to !== req.user.id) return res.status(403).json({ error: 'Access denied' });
      const { status, notes, follow_up_date, call_date, call_time, call_duration, recording_link, order_value } = req.body;
      const result = await query(
        `UPDATE leads SET
           status = COALESCE($1, status),
           notes = COALESCE($2, notes),
           follow_up_date = COALESCE($3, follow_up_date),
           call_date = COALESCE($4, call_date),
           call_time = COALESCE($5, call_time),
           call_duration = COALESCE($6, call_duration),
           recording_link = COALESCE($7, recording_link),
           order_value = COALESCE($8, order_value),
           updated_at = NOW()
         WHERE id = $9 RETURNING *`,
        [status, notes, follow_up_date, call_date, call_time, call_duration, recording_link, order_value, id]
      );

      await log({
        userId: req.user.id,
        action: 'LEAD_UPDATED',
        entityType: 'lead',
        entityId: id,
        oldValue: { status: old.status },
        newValue: { status },
        ipAddress: req.ip,
      });

      if (status && status !== old.status) {
        await log({
          userId: req.user.id,
          action: 'STATUS_CHANGED',
          entityType: 'lead',
          entityId: id,
          oldValue: { status: old.status },
          newValue: { status },
          ipAddress: req.ip,
        });
      }

      return res.json({ lead: result.rows[0] });
    }

    const {
      name, phone_number, source, assigned_to, call_date, call_time,
      call_duration, recording_link, status, follow_up_date, order_value, notes
    } = req.body;

    const result = await query(
      `UPDATE leads SET
         name = COALESCE($1, name),
         phone_number = COALESCE($2, phone_number),
         source = COALESCE($3, source),
         assigned_to = COALESCE($4, assigned_to),
         call_date = COALESCE($5, call_date),
         call_time = COALESCE($6, call_time),
         call_duration = COALESCE($7, call_duration),
         recording_link = COALESCE($8, recording_link),
         status = COALESCE($9, status),
         follow_up_date = COALESCE($10, follow_up_date),
         order_value = COALESCE($11, order_value),
         notes = COALESCE($12, notes),
         updated_at = NOW()
       WHERE id = $13 RETURNING *`,
      [name, phone_number, source, assigned_to, call_date, call_time,
        call_duration, recording_link, status, follow_up_date, order_value, notes, id]
    );

    if (assigned_to && assigned_to !== old.assigned_to) {
      await assignLeadToUser(id, assigned_to, req.user.id, 'manual');
      await log({
        userId: req.user.id,
        action: 'LEAD_REASSIGNED',
        entityType: 'lead',
        entityId: id,
        oldValue: { assigned_to: old.assigned_to },
        newValue: { assigned_to },
        ipAddress: req.ip,
      });
    }

    res.json({ lead: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const deleteLead = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await query('SELECT * FROM leads WHERE id = $1', [id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Lead not found' });

    await query('DELETE FROM leads WHERE id = $1', [id]);

    await log({
      userId: req.user.id,
      action: 'LEAD_DELETED',
      entityType: 'lead',
      entityId: id,
      oldValue: existing.rows[0],
      ipAddress: req.ip,
    });

    res.json({ message: 'Lead deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const bulkDelete = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !ids.length) return res.status(400).json({ error: 'No lead IDs provided' });

    await query('DELETE FROM leads WHERE id = ANY($1)', [ids]);

    await log({
      userId: req.user.id,
      action: 'LEADS_BULK_DELETED',
      entityType: 'lead',
      newValue: { count: ids.length },
      ipAddress: req.ip,
    });

    res.json({ message: `${ids.length} leads deleted` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const bulkReassign = async (req, res) => {
  try {
    const { ids, assignedTo } = req.body;
    if (!ids || !ids.length || !assignedTo) {
      return res.status(400).json({ error: 'Lead IDs and assignedTo are required' });
    }

    for (const id of ids) {
      await assignLeadToUser(id, assignedTo, req.user.id, 'bulk');
    }

    await log({
      userId: req.user.id,
      action: 'LEADS_BULK_REASSIGNED',
      entityType: 'lead',
      newValue: { count: ids.length, assignedTo },
      ipAddress: req.ip,
    });

    res.json({ message: `${ids.length} leads reassigned` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const addNote = async (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body;

    if (!note?.trim()) return res.status(400).json({ error: 'Note is required' });

    const lead = await query('SELECT * FROM leads WHERE id = $1', [id]);
    if (!lead.rows.length) return res.status(404).json({ error: 'Lead not found' });

    if (req.user.role === 'caller' && lead.rows[0].assigned_to !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await query(
      'INSERT INTO lead_notes (lead_id, user_id, note) VALUES ($1, $2, $3) RETURNING *',
      [id, req.user.id, note.trim()]
    );

    await log({
      userId: req.user.id,
      action: 'NOTE_ADDED',
      entityType: 'lead',
      entityId: id,
      newValue: { note: note.trim() },
      ipAddress: req.ip,
    });

    res.status(201).json({ note: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const exportLeads = async (req, res) => {
  try {
    const { format = 'csv' } = req.query;

    const conditions = [];
    const params = [];
    let paramIdx = 1;

    if (req.user.role === 'caller') {
      conditions.push(`l.assigned_to = $${paramIdx++}`);
      params.push(req.user.id);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await query(
      `SELECT l.name, l.phone_number, l.source, u.name as assigned_to,
              l.status, l.call_date, l.call_duration, l.follow_up_date,
              l.order_value, l.notes, l.created_at
       FROM leads l
       LEFT JOIN users u ON l.assigned_to = u.id
       ${where}
       ORDER BY l.created_at DESC`,
      params
    );

    if (format === 'xlsx') {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(result.rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Leads');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="leads.xlsx"');
      return res.send(buf);
    }

    const csv = stringify(result.rows, { header: true });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="leads.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const importLeads = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const content = req.file.buffer.toString('utf-8');
    const records = parse(content, { columns: true, skip_empty_lines: true, trim: true });

    let imported = 0;
    let failed = 0;
    const errors = [];

    for (const record of records) {
      try {
        const name = record.name || record.Name;
        const phone_number = record.phone_number || record['Phone Number'] || record.phone;

        if (!name || !phone_number) {
          failed++;
          errors.push(`Row missing name or phone: ${JSON.stringify(record)}`);
          continue;
        }

        let callerId = null;
        try {
          callerId = await getNextRoundRobinCaller();
        } catch (e) {}

        await query(
          `INSERT INTO leads (name, phone_number, source, assigned_to, status, notes, created_by)
           VALUES ($1, $2, $3, $4, 'not_contacted', $5, $6)
           ON CONFLICT DO NOTHING`,
          [name.trim(), phone_number.trim(), record.source || '', callerId, record.notes || '', req.user.id]
        );
        imported++;
      } catch (e) {
        failed++;
        errors.push(e.message);
      }
    }

    await log({
      userId: req.user.id,
      action: 'LEADS_IMPORTED',
      entityType: 'lead',
      newValue: { imported, failed },
      ipAddress: req.ip,
    });

    res.json({ message: `Import complete: ${imported} imported, ${failed} failed`, imported, failed, errors: errors.slice(0, 10) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const importLeadsJson = async (req, res) => {
  try {
    const { leads: rows } = req.body;
    if (!Array.isArray(rows) || !rows.length) {
      return res.status(400).json({ error: 'No leads provided' });
    }

    let imported = 0;
    let failed = 0;
    const errors = [];

    for (const record of rows) {
      try {
        const name = (record.name || '').trim();
        const phone_number = (record.phone_number || '').trim();

        if (!name || !phone_number) {
          failed++;
          errors.push(`Missing name or phone: ${JSON.stringify(record)}`);
          continue;
        }

        let callerId = null;
        try { callerId = await getNextRoundRobinCaller(); } catch (e) {}

        await query(
          `INSERT INTO leads (name, phone_number, source, assigned_to, status, notes, created_by)
           VALUES ($1, $2, $3, $4, 'not_contacted', $5, $6)
           ON CONFLICT DO NOTHING`,
          [name, phone_number, record.source || '', callerId, record.notes || '', req.user.id]
        );
        imported++;
      } catch (e) {
        failed++;
        errors.push(e.message);
      }
    }

    await log({
      userId: req.user.id,
      action: 'LEADS_IMPORTED',
      entityType: 'lead',
      newValue: { imported, failed },
      ipAddress: req.ip,
    });

    res.json({ message: `Import complete: ${imported} imported, ${failed} failed`, imported, failed, errors: errors.slice(0, 10) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getLeads, getLeadById, createLead, updateLead, deleteLead,
  bulkDelete, bulkReassign, addNote, exportLeads, importLeads, importLeadsJson
};
