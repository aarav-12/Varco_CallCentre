require('dotenv').config({ path: '../.env.example' });
require('dotenv').config();

const bcrypt = require('bcryptjs');
const { pool, runMigrations } = require('../src/db');

const MANAGER = {
  name: 'Rahul Sharma',
  email: 'manager@varco.in',
  password: 'Manager@123',
  role: 'manager',
};

const CALLERS = [
  { name: 'Priya Patel', email: 'priya@varco.in', password: 'Caller@123', role: 'caller' },
  { name: 'Amit Kumar', email: 'amit@varco.in', password: 'Caller@123', role: 'caller' },
  { name: 'Sneha Verma', email: 'sneha@varco.in', password: 'Caller@123', role: 'caller' },
  { name: 'Rohit Singh', email: 'rohit@varco.in', password: 'Caller@123', role: 'caller' },
  { name: 'Ananya Gupta', email: 'ananya@varco.in', password: 'Caller@123', role: 'caller' },
];

const LEAD_SOURCES = ['Website', 'Facebook', 'Google Ads', 'Referral', 'Cold Call', 'Instagram', 'Email Campaign'];
const LEAD_STATUSES = ['not_contacted', 'no_answer', 'busy', 'interested', 'follow_up_required', 'order_confirmed', 'not_interested', 'invalid_number'];
const LEAD_NAMES = [
  'Vikram Mehta', 'Kavya Nair', 'Arjun Reddy', 'Pooja Shah', 'Suresh Rajan',
  'Meera Krishnan', 'Deepak Joshi', 'Asha Pillai', 'Nitin Dubey', 'Ritu Agarwal',
  'Sanjay Malhotra', 'Swathi Iyer', 'Manish Tiwari', 'Divya Menon', 'Kiran Yadav',
  'Lalit Sharma', 'Preeti Nanda', 'Vijay Bose', 'Sunita Chauhan', 'Ramesh Pandey',
];

const randomFrom = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomPhone = () => `9${randomInt(100000000, 999999999)}`;

async function seed() {
  await runMigrations();
  const client = await pool.connect();

  try {
    console.log('🌱 Starting seed...');

    // Clear existing data (in order of dependencies)
    await client.query('TRUNCATE TABLE activity_logs, alerts, performance_metrics, round_robin_state, calls, follow_ups, lead_notes, lead_assignments, leads, attendance, refresh_tokens, users RESTART IDENTITY CASCADE');
    await client.query('INSERT INTO round_robin_state (id, last_assigned_index) VALUES (1, 0)');

    // Create users
    console.log('Creating users...');
    const userIds = {};
    const allUsers = [MANAGER, ...CALLERS];

    for (const u of allUsers) {
      const hash = await bcrypt.hash(u.password, 12);
      const result = await client.query(
        'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id',
        [u.name, u.email, hash, u.role]
      );
      userIds[u.email] = result.rows[0].id;
    }

    const callerIds = CALLERS.map(c => userIds[c.email]);
    const managerId = userIds[MANAGER.email];

    console.log('Creating leads...');
    const leadIds = [];
    for (let i = 0; i < LEAD_NAMES.length; i++) {
      const callerId = callerIds[i % callerIds.length];
      const status = randomFrom(LEAD_STATUSES);
      const daysAgo = randomInt(0, 30);
      const createdAt = new Date(Date.now() - daysAgo * 86400000);
      const callDate = new Date(createdAt);

      const result = await client.query(
        `INSERT INTO leads (name, phone_number, source, assigned_to, status,
           call_date, order_value, notes, created_by, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) RETURNING id`,
        [
          LEAD_NAMES[i],
          randomPhone(),
          randomFrom(LEAD_SOURCES),
          callerId,
          status,
          callDate.toISOString().split('T')[0],
          status === 'order_confirmed' ? randomInt(500, 5000) : 0,
          `Sample note for ${LEAD_NAMES[i]}`,
          managerId,
          createdAt,
        ]
      );
      leadIds.push({ id: result.rows[0].id, callerId, status });

      await client.query(
        'INSERT INTO lead_assignments (lead_id, assigned_to, assigned_by, assignment_type) VALUES ($1,$2,$3,$4)',
        [result.rows[0].id, callerId, managerId, 'manual']
      );
    }

    console.log('Creating attendance records...');
    const today = new Date();
    for (let d = 0; d < 7; d++) {
      const date = new Date(today);
      date.setDate(date.getDate() - d);
      const dateStr = date.toISOString().split('T')[0];

      for (const callerId of callerIds) {
        const isLate = Math.random() < 0.2;
        const loginHour = isLate ? 9 : 8;
        const loginMinute = isLate ? randomInt(6, 30) : randomInt(50, 59);
        const loginTime = new Date(date);
        loginTime.setHours(loginHour, loginMinute, 0);

        const logoutTime = new Date(loginTime);
        logoutTime.setHours(17, randomInt(0, 30), 0);

        const breakMinutes = randomInt(30, 60);
        const workingMinutes = Math.floor((logoutTime - loginTime) / 60000) - breakMinutes;

        await client.query(
          `INSERT INTO attendance (user_id, date, login_time, logout_time, total_break_minutes, total_working_minutes, status, is_late)
           VALUES ($1,$2,$3,$4,$5,$6,'offline',$7)
           ON CONFLICT (user_id, date) DO NOTHING`,
          [callerId, dateStr, loginTime, logoutTime, breakMinutes, Math.max(0, workingMinutes), isLate]
        );
      }
    }

    // Mark today's first 3 callers as online
    const todayStr = today.toISOString().split('T')[0];
    for (let i = 0; i < 3; i++) {
      const loginTime = new Date(today);
      loginTime.setHours(9, randomInt(0, 4), 0);
      await client.query(
        `UPDATE attendance SET status = 'online', logout_time = NULL
         WHERE user_id = $1 AND date = $2`,
        [callerIds[i], todayStr]
      );
    }

    console.log('Creating calls and follow-ups...');
    const today7days = new Date(today);
    today7days.setDate(today.getDate() - 7);

    for (const lead of leadIds) {
      const numCalls = randomInt(1, 4);
      for (let c = 0; c < numCalls; c++) {
        const callDate = new Date(today);
        callDate.setDate(today.getDate() - randomInt(0, 6));
        const duration = lead.status !== 'no_answer' && lead.status !== 'busy' ? randomInt(60, 600) : 0;

        await client.query(
          `INSERT INTO calls (lead_id, caller_id, call_date, call_time, duration, outcome)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            lead.id,
            lead.callerId,
            callDate.toISOString().split('T')[0],
            `${randomInt(9, 17).toString().padStart(2, '0')}:${randomInt(0, 59).toString().padStart(2, '0')}:00`,
            duration,
            lead.status,
          ]
        );
      }

      if (['interested', 'follow_up_required'].includes(lead.status)) {
        const fuDate = new Date(today);
        fuDate.setDate(today.getDate() + randomInt(-2, 5));
        const fuDateStr = fuDate.toISOString().split('T')[0];
        const todayStr = today.toISOString().split('T')[0];
        const tomorrowStr = new Date(today.getTime() + 86400000).toISOString().split('T')[0];

        let category = 'green';
        if (fuDateStr < todayStr) category = 'red';
        else if (fuDateStr === todayStr) category = 'amber';

        await client.query(
          `INSERT INTO follow_ups (lead_id, caller_id, scheduled_date, scheduled_time, notes, category)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [lead.id, lead.callerId, fuDateStr, '10:00:00', 'Follow up on interest', category]
        );
      }
    }

    console.log('Creating sample alerts...');
    await client.query(
      `INSERT INTO alerts (type, title, message, user_id, severity) VALUES
       ('late_login', 'Late Login', 'Amit Kumar logged in late at 09:15 AM', $1, 'warning'),
       ('low_calls', 'Low Call Count', 'Sneha Verma has only made 45 calls by 2 PM', $2, 'warning'),
       ('overdue_followups', 'Overdue Follow-Ups', 'Rohit Singh has 3 overdue follow-up(s)', $3, 'critical')`,
      [callerIds[1], callerIds[2], callerIds[3]]
    );

    console.log('\n✅ Seed completed successfully!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 DEMO CREDENTIALS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`👔 Manager:  manager@varco.in  /  Manager@123`);
    CALLERS.forEach(c => console.log(`📞 Caller:   ${c.email}  /  Caller@123`));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(console.error);
