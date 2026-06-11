const { query } = require('../db');

const log = async ({ userId, action, entityType, entityId, oldValue, newValue, ipAddress }) => {
  try {
    await query(
      `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, old_value, new_value, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        userId || null,
        action,
        entityType || null,
        entityId || null,
        oldValue ? JSON.stringify(oldValue) : null,
        newValue ? JSON.stringify(newValue) : null,
        ipAddress || null,
      ]
    );
  } catch (err) {
    console.error('Activity log error:', err.message);
  }
};

module.exports = { log };
