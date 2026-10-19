const db = require('../src/db/database');
const bcrypt = require('bcryptjs');

async function syncFromCloud() {
  try {
    const adminRes = await fetch('https://aai-dim-licensing.onrender.com/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'aadeshnavade7@gmail.com', password: 'AdminPassword123!' })
    });
    const adminData = await adminRes.json();
    if (!adminData.success) {
      console.error('Failed to login as admin on cloud:', adminData);
      return;
    }
    const token = adminData.token;

    const custListRes = await fetch('https://aai-dim-licensing.onrender.com/api/v1/admin/customers', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const { customers } = await custListRes.json();
    console.log(`Fetched ${customers.length} customers from Render cloud.`);

    const defaultHash = bcrypt.hashSync('Password123!', 10);
    const adminHash = bcrypt.hashSync('AdminPassword123!', 10);

    for (const c of customers) {
      const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(c.email);
      const pwHash = c.email.includes('aadesh') ? adminHash : defaultHash;
      const now = new Date().toISOString();

      if (!existing) {
        db.prepare(`
          INSERT INTO users (id, email, password_hash, full_name, company, role, is_approved, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'customer', 1, ?, ?)
        `).run(c.id, c.email, pwHash, c.fullName || '', c.company || '', c.createdAt || now, now);
        console.log('Inserted customer locally:', c.email);
      } else {
        db.prepare('UPDATE users SET password_hash = ?, is_approved = 1 WHERE email = ?').run(pwHash, c.email);
        console.log('Updated customer locally:', c.email);
      }

      const sub = db.prepare('SELECT id FROM subscriptions WHERE user_id = ?').get(c.id);
      const subData = c.subscription || {};
      const expiry = subData.expiryDate || new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
      const plan = subData.planCode || 'pro_monthly';
      const interval = subData.reauthIntervalDays || 7;

      if (!sub) {
        const subId = subData.id || ('sub_' + Math.random().toString(36).substring(2, 10));
        db.prepare(`
          INSERT INTO subscriptions (id, user_id, status, plan_code, start_date, expiry_date, reauth_interval_days, created_at, updated_at)
          VALUES (?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?)
        `).run(subId, c.id, plan, now, expiry, interval, now, now);
        console.log('Inserted subscription locally for:', c.email);
      } else {
        db.prepare(`
          UPDATE subscriptions SET status = 'ACTIVE', expiry_date = ?, reauth_interval_days = ? WHERE user_id = ?
        `).run(expiry, interval, c.id);
        console.log('Updated subscription locally for:', c.email);
      }
    }

    console.log('--- SYNC COMPLETED SUCCESSFULLY ---');
  } catch (err) {
    console.error('Error during sync:', err);
  }
}

syncFromCloud();
