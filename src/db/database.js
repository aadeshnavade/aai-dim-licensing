const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const dbDir = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'licensing.db');
const db = new Database(dbPath);

// Enable foreign keys and Write-Ahead Logging for high concurrency & durability
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

function initSchema() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            full_name TEXT,
            company TEXT,
            role TEXT NOT NULL DEFAULT 'customer',
            is_approved INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS subscriptions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL UNIQUE,
            status TEXT NOT NULL DEFAULT 'INACTIVE',
            plan_code TEXT,
            start_date TEXT,
            expiry_date TEXT,
            reauth_interval_days INTEGER NOT NULL DEFAULT 7,
            last_auth_date TEXT,
            last_verified_date TEXT,
            next_reauth_deadline TEXT,
            discount_inr REAL DEFAULT 0,
            negotiated_price_inr REAL,
            payment_reference TEXT,
            admin_notes TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS pricing_plans (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            duration_months INTEGER NOT NULL,
            new_customer_price_inr REAL NOT NULL,
            renewal_price_inr REAL NOT NULL,
            description TEXT,
            terms TEXT,
            is_enabled INTEGER NOT NULL DEFAULT 1,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS releases (
            id TEXT PRIMARY KEY,
            version_number TEXT NOT NULL UNIQUE,
            release_date TEXT NOT NULL,
            min_revit_version TEXT NOT NULL DEFAULT '2024',
            max_revit_version TEXT NOT NULL DEFAULT '2027+',
            file_path TEXT NOT NULL,
            file_name TEXT NOT NULL,
            file_size_bytes INTEGER NOT NULL,
            release_notes TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            is_mandatory INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            actor_user_id TEXT,
            actor_email TEXT,
            action TEXT NOT NULL,
            target_user_id TEXT,
            target_email TEXT,
            details TEXT,
            timestamp TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS purchase_requests (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            customer_email TEXT NOT NULL,
            plan_code TEXT NOT NULL,
            duration_months INTEGER NOT NULL,
            price_inr REAL NOT NULL,
            request_type TEXT NOT NULL,
            terms_snapshot TEXT,
            status TEXT NOT NULL DEFAULT 'EMAIL_PREPARED',
            created_at TEXT NOT NULL
        );
    `);

    // Seed Default Settings if not present
    const now = new Date().toISOString();
    const defaultSettings = [
        ['developer_name', 'Aadesh Navade'],
        ['developer_email', 'aadeshnavade7@gmail.com'],
        ['developer_whatsapp', '+91 9341102949'],
        ['product_name', 'AAI DIM'],
        ['product_description', 'Autonomous BIM Architectural Dimensioning & Advanced Digital Twin AI Copilot for Autodesk Revit'],
        ['subscription_terms', 'Subscriptions are billed for the selected calendar duration in INR. Licenses are tied to verified customer accounts and grant full access to all dimensioning features, dynamic auto-updates, and version updates.'],
        ['refund_policy', 'Please review feature compatibility and test your models with our support team before purchasing. For any queries or custom requirements, contact developer Aadesh Navade prior to payment. Approved licenses are non-transferable once activated.'],
        ['default_reauth_days', '7'],
        ['offline_grace_hours', '72'],
        ['jwt_secret', crypto.randomBytes(32).toString('hex')]
    ];

    const insertSetting = db.prepare(`
        INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)
    `);

    for (const [k, v] of defaultSettings) {
        insertSetting.run(k, v, now);
    }

    // Seed Pricing Plans if not present
    const insertPlan = db.prepare(`
        INSERT OR IGNORE INTO pricing_plans 
        (id, name, duration_months, new_customer_price_inr, renewal_price_inr, description, terms, is_enabled, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    `);

    // Real initial plans in INR (can be edited at any time via Admin Portal)
    insertPlan.run(
        'monthly',
        'Monthly Plan',
        1,
        1499.00,
        1199.00,
        'Full access to all AAI DIM features, AI Assistant, and updates for 1 calendar month.',
        '1 calendar month subscription with renewal discount for continuing customers.',
        now
    );

    insertPlan.run(
        'quarterly',
        'Quarterly Plan',
        3,
        3999.00,
        3299.00,
        'Best for active project cycles. 3 calendar months of full access with priority support.',
        '3 calendar months subscription billed in INR.',
        now
    );

    insertPlan.run(
        'half_yearly',
        'Half-Yearly Plan',
        6,
        6999.00,
        5799.00,
        'Maximum value for architectural teams. 6 calendar months of uninterrupted licensing & updates.',
        '6 calendar months subscription billed in INR with maximum savings.',
        now
    );

    // ALWAYS guarantee master admin aadeshnavade7@gmail.com exists with AdminPassword123!
    const masterEmail = 'aadeshnavade7@gmail.com';
    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync('AdminPassword123!', salt);
    const masterUser = db.prepare('SELECT id, email FROM users WHERE email = ?').get(masterEmail);

    let masterUserId;
    if (!masterUser) {
        masterUserId = 'usr_admin_master';
        db.prepare(`
            INSERT INTO users (id, email, password_hash, full_name, company, role, is_approved, created_at, updated_at)
            VALUES (?, ?, ?, 'Aadesh Navade', 'AAI DIM', 'admin', 1, ?, ?)
        `).run(masterUserId, masterEmail, passwordHash, now, now);
    } else {
        masterUserId = masterUser.id;
        db.prepare(`
            UPDATE users SET password_hash = ?, role = 'admin', is_approved = 1, updated_at = ?
            WHERE email = ?
        `).run(passwordHash, now, masterEmail);
    }

    // Ensure 10-year VIP subscription for master admin
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 10);
    const masterSub = db.prepare('SELECT id FROM subscriptions WHERE user_id = ?').get(masterUserId);
    if (!masterSub) {
        db.prepare(`
            INSERT INTO subscriptions (id, user_id, status, plan_code, start_date, expiry_date, reauth_interval_days, created_at, updated_at)
            VALUES (?, ?, 'ACTIVE', 'half_yearly', ?, ?, 365, ?, ?)
        `).run('sub_admin_master', masterUserId, now, expiryDate.toISOString(), now, now);
    } else {
        db.prepare(`
            UPDATE subscriptions SET status = 'ACTIVE', expiry_date = ?, reauth_interval_days = 365, updated_at = ?
            WHERE user_id = ?
        `).run(expiryDate.toISOString(), now, masterUserId);
    }

    // Also guarantee backup admin account admin@aaidim.com has AdminPassword123!
    const backupAdmin = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@aaidim.com');
    if (backupAdmin) {
        db.prepare(`
            UPDATE users SET password_hash = ?, role = 'admin', is_approved = 1, updated_at = ?
            WHERE email = 'admin@aaidim.com'
        `).run(passwordHash, now);
    } else {
        db.prepare(`
            INSERT INTO users (id, email, password_hash, full_name, company, role, is_approved, created_at, updated_at)
            VALUES ('usr_admin_backup', 'admin@aaidim.com', ?, 'System Administrator', 'AAI DIM', 'admin', 1, ?, ?)
        `).run(passwordHash, now, now);
    }

    // Seed initial release if v1.0.0 exists on disk
    const releasesDir = process.env.RELEASES_DIR || path.join(__dirname, '..', '..', 'Releases');
    const initialZip = path.join(releasesDir, 'AAI_DIM_v1.0.0_Setup.zip');
    if (fs.existsSync(initialZip)) {
        const stats = fs.statSync(initialZip);
        const insertRelease = db.prepare(`
            INSERT OR IGNORE INTO releases
            (id, version_number, release_date, min_revit_version, max_revit_version, file_path, file_name, file_size_bytes, release_notes, is_active, is_mandatory, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?)
        `);
        insertRelease.run(
            'rel_v1.0.0',
            '1.0.0',
            now,
            '2024',
            '2027+',
            initialZip,
            'AAI_DIM_v1.0.0_Setup.zip',
            stats.size,
            'Initial public release with autonomous exterior, interior, aligned (angled), curved, and angular dimensioning, plus Autodesk AI-style Conversational Assistant.',
            now
        );
    }
}

initSchema();

module.exports = db;
