const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const db = require('../db/database');
const { requireAdmin } = require('../middleware/auth');
const {
    activateOrExtendSubscription,
    logAudit,
    calculateNextReauthDeadline,
    getOrCreateSubscription
} = require('../services/subscriptionService');

// Multer storage for plugin releases in D:\AAI DIM\Releases
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dest = path.join('D:', 'AAI DIM', 'Releases');
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }
        cb(null, dest);
    },
    filename: (req, file, cb) => {
        // e.g. AAI_DIM_v1.1.0_Setup.zip
        cb(null, file.originalname);
    }
});
const upload = multer({ storage });

// All routes here require administrator authentication
router.use(requireAdmin);

/**
 * 1. CUSTOMER MANAGEMENT
 */

// List customers with filtering and pagination
router.get('/customers', (req, res) => {
    const { query, status, limit, offset } = req.query;
    let sql = `
        SELECT 
            u.id, u.email, u.full_name, u.company, u.role, u.is_approved, u.created_at,
            s.id as sub_id, s.status as sub_status, s.plan_code, s.start_date, s.expiry_date,
            s.reauth_interval_days, s.last_auth_date, s.last_verified_date, s.next_reauth_deadline,
            s.payment_reference, s.admin_notes, s.discount_inr, s.negotiated_price_inr
        FROM users u
        LEFT JOIN subscriptions s ON u.id = s.user_id
        WHERE u.role != 'admin'
    `;
    const params = [];

    if (query && query.trim()) {
        sql += ` AND (u.email LIKE ? OR u.full_name LIKE ? OR u.company LIKE ?)`;
        const q = `%${query.trim()}%`;
        params.push(q, q, q);
    }

    if (status && status !== 'ALL') {
        sql += ` AND s.status = ?`;
        params.push(status);
    }

    sql += ` ORDER BY u.created_at DESC`;

    const customers = db.prepare(sql).all(...params);
    res.json({
        success: true,
        customers: customers.map(c => ({
            id: c.id,
            email: c.email,
            fullName: c.full_name,
            company: c.company,
            isApproved: Boolean(c.is_approved),
            createdAt: c.created_at,
            subscription: {
                id: c.sub_id,
                status: c.sub_status || 'INACTIVE',
                planCode: c.plan_code,
                startDate: c.start_date,
                expiryDate: c.expiry_date,
                reauthIntervalDays: c.reauth_interval_days || 7,
                lastAuthDate: c.last_auth_date,
                lastVerifiedDate: c.last_verified_date,
                nextReauthDeadline: c.next_reauth_deadline,
                paymentReference: c.payment_reference,
                adminNotes: c.admin_notes,
                discountInr: c.discount_inr,
                negotiatedPriceInr: c.negotiated_price_inr
            }
        }))
    });
});

// Add customer manually by email
router.post('/customers/create', (req, res) => {
    const { email, fullName, company, initialPassword, autoApprove } = req.body;
    if (!email) {
        return res.status(400).json({ success: false, error: 'Customer email address is required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
    if (existing) {
        return res.status(409).json({ success: false, error: 'Customer email already registered.' });
    }

    const password = initialPassword || Math.random().toString(36).substring(2, 10);
    const passwordHash = bcrypt.hashSync(password, 10);
    const userId = 'usr_' + Math.random().toString(36).substring(2, 10);
    const nowIso = new Date().toISOString();
    const isApproved = autoApprove ? 1 : 0;

    db.prepare(`
        INSERT INTO users (id, email, password_hash, full_name, company, role, is_approved, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'customer', ?, ?, ?)
    `).run(userId, cleanEmail, passwordHash, fullName || '', company || '', isApproved, nowIso, nowIso);

    getOrCreateSubscription(userId);

    logAudit(req.user.id, req.user.email, 'CUSTOMER_CREATED', userId, cleanEmail, {
        fullName,
        company,
        isApproved
    });

    res.json({
        success: true,
        message: 'Customer account created successfully.',
        customer: {
            id: userId,
            email: cleanEmail,
            temporaryPassword: password,
            isApproved: Boolean(isApproved)
        }
    });
});

// Reset/Set Customer Password by Admin
router.post('/customers/:id/reset-password', (req, res) => {
    const { id } = req.params;
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ success: false, error: 'Password must be at least 6 characters long.' });
    }

    const user = db.prepare('SELECT id, email FROM users WHERE id = ?').get(id);
    if (!user) {
        return res.status(404).json({ success: false, error: 'Customer not found.' });
    }

    const passwordHash = bcrypt.hashSync(newPassword, 10);
    const nowIso = new Date().toISOString();
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(passwordHash, nowIso, id);

    logAudit(req.user.id, req.user.email, 'CUSTOMER_PASSWORD_RESET', user.id, user.email, {});

    res.json({
        success: true,
        message: `Password updated successfully for ${user.email}.`
    });
});

// Approve or Unapprove Customer
router.post('/customers/:id/approve', (req, res) => {
    const { id } = req.params;
    const { approve } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) {
        return res.status(404).json({ success: false, error: 'Customer not found.' });
    }

    const isApproved = approve !== false ? 1 : 0;
    const nowIso = new Date().toISOString();
    db.prepare('UPDATE users SET is_approved = ?, updated_at = ? WHERE id = ?').run(isApproved, nowIso, id);

    logAudit(req.user.id, req.user.email, isApproved ? 'CUSTOMER_APPROVED' : 'CUSTOMER_UNAPPROVED', user.id, user.email, {});

    res.json({
        success: true,
        message: `Customer ${user.email} approval updated to: ${isApproved ? 'Approved' : 'Pending'}`,
        isApproved: Boolean(isApproved)
    });
});

// Activate or Extend Subscription (Manual payment confirmed)
router.post('/customers/:id/subscription/activate', (req, res) => {
    const { id } = req.params;
    const { planCode, durationMonths, reauthIntervalDays, paymentRef, notes } = req.body;

    try {
        const sub = activateOrExtendSubscription({
            userId: id,
            planCode: planCode || 'monthly',
            durationMonths: durationMonths || 1,
            reauthIntervalDays: reauthIntervalDays || 7,
            paymentRef: paymentRef || '',
            notes: notes || '',
            actorAdmin: req.user
        });

        res.json({
            success: true,
            message: `Subscription successfully updated! New expiry date: ${new Date(sub.expiry_date).toLocaleDateString()}`,
            subscription: sub
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

// Suspend or Revoke Subscription
router.post('/customers/:id/subscription/status', (req, res) => {
    const { id } = req.params;
    const { status, reason } = req.body; // 'ACTIVE', 'SUSPENDED', 'REVOKED'
    const allowed = ['ACTIVE', 'SUSPENDED', 'REVOKED'];
    if (!allowed.includes(status)) {
        return res.status(400).json({ success: false, error: 'Invalid status. Choose from: ' + allowed.join(', ') });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) {
        return res.status(404).json({ success: false, error: 'Customer not found.' });
    }

    const nowIso = new Date().toISOString();
    db.prepare(`
        UPDATE subscriptions 
        SET status = ?, 
            admin_notes = COALESCE(admin_notes, '') || '\nStatus changed to ' || ? || ' (' || ? || ') on ' || ?,
            updated_at = ? 
        WHERE user_id = ?
    `).run(status, status, reason || 'Admin action', nowIso, nowIso, id);

    logAudit(req.user.id, req.user.email, `SUBSCRIPTION_STATUS_${status}`, user.id, user.email, { status, reason });

    res.json({
        success: true,
        message: `Customer ${user.email} subscription set to ${status}.`,
        status
    });
});

// Update Individual Reauthentication Interval (Days) without rebuilding plugin
router.post('/customers/:id/reauth-interval', (req, res) => {
    const { id } = req.params;
    const { intervalDays } = req.body;

    const days = parseInt(intervalDays, 10);
    if (isNaN(days) || days < 1) {
        return res.status(400).json({ success: false, error: 'Reauthentication interval must be a positive integer (e.g. 1, 7, 14, 30).' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) {
        return res.status(404).json({ success: false, error: 'Customer not found.' });
    }

    const nextDeadline = calculateNextReauthDeadline(days);
    const nowIso = new Date().toISOString();

    db.prepare(`
        UPDATE subscriptions
        SET reauth_interval_days = ?,
            next_reauth_deadline = ?,
            updated_at = ?
        WHERE user_id = ?
    `).run(days, nextDeadline, nowIso, id);

    logAudit(req.user.id, req.user.email, 'REAUTH_INTERVAL_UPDATED', user.id, user.email, {
        reauthIntervalDays: days,
        nextReauthDeadline: nextDeadline
    });

    res.json({
        success: true,
        message: `Reauthentication interval updated to ${days} days for ${user.email}. Takes effect immediately.`,
        reauthIntervalDays: days,
        nextReauthDeadline: nextDeadline
    });
});

/**
 * 2. PRICING MANAGEMENT
 */

// Get all plans for admin editing
router.get('/pricing', (req, res) => {
    const plans = db.prepare('SELECT * FROM pricing_plans ORDER BY duration_months ASC').all();
    res.json({ success: true, plans });
});

// Update plan prices & terms
router.post('/pricing/:id', (req, res) => {
    const { id } = req.params;
    const { name, newCustomerPriceInr, renewalPriceInr, description, terms, isEnabled } = req.body;

    const existing = db.prepare('SELECT * FROM pricing_plans WHERE id = ?').get(id);
    if (!existing) {
        return res.status(404).json({ success: false, error: 'Plan not found.' });
    }

    const nowIso = new Date().toISOString();
    db.prepare(`
        UPDATE pricing_plans
        SET name = COALESCE(?, name),
            new_customer_price_inr = COALESCE(?, new_customer_price_inr),
            renewal_price_inr = COALESCE(?, renewal_price_inr),
            description = COALESCE(?, description),
            terms = COALESCE(?, terms),
            is_enabled = COALESCE(?, is_enabled),
            updated_at = ?
        WHERE id = ?
    `).run(
        name,
        newCustomerPriceInr !== undefined ? parseFloat(newCustomerPriceInr) : null,
        renewalPriceInr !== undefined ? parseFloat(renewalPriceInr) : null,
        description,
        terms,
        isEnabled !== undefined ? (isEnabled ? 1 : 0) : null,
        nowIso,
        id
    );

    logAudit(req.user.id, req.user.email, 'PRICING_PLAN_UPDATED', null, null, {
        planId: id,
        newCustomerPriceInr,
        renewalPriceInr,
        isEnabled
    });

    res.json({
        success: true,
        message: `Plan '${id}' updated successfully.`,
        plan: db.prepare('SELECT * FROM pricing_plans WHERE id = ?').get(id)
    });
});

/**
 * 3. PLATFORM & SUPPORT SETTINGS
 */
router.get('/settings', (req, res) => {
    const rows = db.prepare('SELECT key, value, updated_at FROM settings').all();
    const map = {};
    for (const r of rows) map[r.key] = r.value;
    res.json({ success: true, settings: map });
});

router.post('/settings', (req, res) => {
    const { settings } = req.body;
    if (!settings || typeof settings !== 'object') {
        return res.status(400).json({ success: false, error: 'Settings object is required.' });
    }

    const nowIso = new Date().toISOString();
    const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)');

    for (const [key, val] of Object.entries(settings)) {
        if (key === 'jwt_secret') continue; // Never overwrite jwt_secret directly through general settings
        stmt.run(key, String(val), nowIso);
    }

    logAudit(req.user.id, req.user.email, 'SETTINGS_UPDATED', null, null, settings);

    res.json({
        success: true,
        message: 'Platform settings saved successfully.'
    });
});

/**
 * 4. AUDIT LOGS
 */
router.get('/audit-logs', (req, res) => {
    const logs = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 100').all();
    res.json({
        success: true,
        logs: logs.map(l => ({
            id: l.id,
            actorEmail: l.actor_email,
            action: l.action,
            targetEmail: l.target_email,
            details: JSON.parse(l.details || '{}'),
            timestamp: l.timestamp
        }))
    });
});

/**
 * 5. RELEASE & VERSION MANAGEMENT
 */
router.get('/releases', (req, res) => {
    const releases = db.prepare('SELECT * FROM releases ORDER BY created_at DESC').all();
    res.json({ success: true, releases });
});

router.post('/releases/upload', upload.single('packageZip'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, error: 'A zip package file is required.' });
    }

    const { versionNumber, minRevitVersion, maxRevitVersion, releaseNotes, isMandatory } = req.body;
    if (!versionNumber) {
        return res.status(400).json({ success: false, error: 'Version number is required (e.g. 1.1.0).' });
    }

    const cleanVer = versionNumber.trim().replace(/^v/i, '');
    const releaseId = 'rel_' + cleanVer.replace(/\./g, '_');
    const nowIso = new Date().toISOString();

    try {
        db.prepare(`
            INSERT OR REPLACE INTO releases
            (id, version_number, release_date, min_revit_version, max_revit_version, file_path, file_name, file_size_bytes, release_notes, is_active, is_mandatory, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        `).run(
            releaseId,
            cleanVer,
            nowIso,
            minRevitVersion || '2024',
            maxRevitVersion || '2027+',
            req.file.path,
            req.file.originalname,
            req.file.size,
            releaseNotes || '',
            isMandatory ? 1 : 0,
            nowIso
        );

        logAudit(req.user.id, req.user.email, 'VERSION_RELEASED', null, null, {
            version: cleanVer,
            fileName: req.file.originalname,
            sizeBytes: req.file.size
        });

        res.json({
            success: true,
            message: `Version ${cleanVer} uploaded and published successfully! Active users can now download it.`,
            release: db.prepare('SELECT * FROM releases WHERE id = ?').get(releaseId)
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to record release: ' + err.message });
    }
});

// Delete or toggle release active state
router.post('/releases/:id/toggle', (req, res) => {
    const { id } = req.params;
    const rel = db.prepare('SELECT * FROM releases WHERE id = ?').get(id);
    if (!rel) {
        return res.status(404).json({ success: false, error: 'Release not found.' });
    }

    const newActive = rel.is_active ? 0 : 1;
    db.prepare('UPDATE releases SET is_active = ? WHERE id = ?').run(newActive, id);

    logAudit(req.user.id, req.user.email, 'RELEASE_TOGGLED', null, null, { releaseId: id, isActive: newActive });

    res.json({
        success: true,
        message: `Release ${rel.version_number} is now ${newActive ? 'Active' : 'Inactive'}.`,
        isActive: Boolean(newActive)
    });
});

module.exports = router;
