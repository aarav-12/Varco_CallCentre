const { query } = require('../db');

const getNextRoundRobinCaller = async () => {
  const client = await require('../db').getClient();
  try {
    await client.query('BEGIN');

    const callers = await client.query(
      `SELECT id FROM users WHERE role = 'caller' AND is_active = true ORDER BY name`
    );

    if (!callers.rows.length) throw new Error('No active callers available');

    const state = await client.query(
      'SELECT last_assigned_index FROM round_robin_state WHERE id = 1 FOR UPDATE'
    );

    const currentIndex = state.rows[0]?.last_assigned_index || 0;
    const nextIndex = (currentIndex + 1) % callers.rows.length;

    await client.query(
      'UPDATE round_robin_state SET last_assigned_index = $1, updated_at = NOW() WHERE id = 1',
      [nextIndex]
    );

    await client.query('COMMIT');
    return callers.rows[nextIndex].id;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const assignLeadToUser = async (leadId, callerId, assignedById, assignmentType = 'manual') => {
  const currentLead = await query('SELECT assigned_to FROM leads WHERE id = $1', [leadId]);
  const previousCallerId = currentLead.rows[0]?.assigned_to;

  await query('UPDATE leads SET assigned_to = $1, updated_at = NOW() WHERE id = $2', [callerId, leadId]);

  await query(
    `INSERT INTO lead_assignments (lead_id, assigned_from, assigned_to, assigned_by, assignment_type)
     VALUES ($1, $2, $3, $4, $5)`,
    [leadId, previousCallerId, callerId, assignedById, assignmentType]
  );
};

module.exports = { getNextRoundRobinCaller, assignLeadToUser };
