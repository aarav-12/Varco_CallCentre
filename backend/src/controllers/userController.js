const bcrypt = require('bcryptjs');
const { query } = require('../db');
const { log } = require('../utils/activityLogger');

const getUsers = async (req, res) => {
  try {
    const result = await query(
      `SELECT id, name, email, role, is_active, created_at, updated_at
       FROM users ORDER BY created_at DESC`
    );
    res.json({ users: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getCallers = async (req, res) => {
  try {
    const result = await query(
      `SELECT id, name, email, role, is_active FROM users
       WHERE role = 'caller' AND is_active = true ORDER BY name`
    );
    res.json({ callers: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const createUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Name, email, password, and role are required' });
    }

    if (!['manager', 'caller'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, salt);

    const result = await query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role, is_active, created_at`,
      [name.trim(), email.toLowerCase().trim(), passwordHash, role]
    );

    const newUser = result.rows[0];

    await log({
      userId: req.user.id,
      action: 'USER_CREATED',
      entityType: 'user',
      entityId: newUser.id,
      newValue: { name: newUser.name, email: newUser.email, role: newUser.role },
      ipAddress: req.ip,
    });

    res.status(201).json({ user: newUser });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, role, is_active } = req.body;

    const existing = await query('SELECT * FROM users WHERE id = $1', [id]);
    if (!existing.rows.length) {
      return res.status(404).json({ error: 'User not found' });
    }

    const old = existing.rows[0];

    const result = await query(
      `UPDATE users SET
        name = COALESCE($1, name),
        email = COALESCE($2, email),
        role = COALESCE($3, role),
        is_active = COALESCE($4, is_active),
        updated_at = NOW()
       WHERE id = $5
       RETURNING id, name, email, role, is_active, created_at, updated_at`,
      [name?.trim(), email?.toLowerCase().trim(), role, is_active, id]
    );

    await log({
      userId: req.user.id,
      action: 'USER_UPDATED',
      entityType: 'user',
      entityId: id,
      oldValue: { name: old.name, email: old.email, role: old.role, is_active: old.is_active },
      newValue: result.rows[0],
      ipAddress: req.ip,
    });

    res.json({ user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = await query('SELECT id, name FROM users WHERE id = $1', [id]);
    if (!existing.rows.length) {
      return res.status(404).json({ error: 'User not found' });
    }

    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    await query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [passwordHash, id]
    );

    await log({
      userId: req.user.id,
      action: 'PASSWORD_RESET',
      entityType: 'user',
      entityId: id,
      ipAddress: req.ip,
    });

    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const toggleUserStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await query('SELECT * FROM users WHERE id = $1', [id]);
    if (!existing.rows.length) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = existing.rows[0];
    const newStatus = !user.is_active;

    const result = await query(
      'UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, is_active',
      [newStatus, id]
    );

    await log({
      userId: req.user.id,
      action: newStatus ? 'USER_ENABLED' : 'USER_DISABLED',
      entityType: 'user',
      entityId: id,
      oldValue: { is_active: user.is_active },
      newValue: { is_active: newStatus },
      ipAddress: req.ip,
    });

    res.json({ user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { getUsers, getCallers, createUser, updateUser, resetPassword, toggleUserStatus };
