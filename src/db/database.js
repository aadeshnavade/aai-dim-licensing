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

// Enable foreign keys and Write-Ahead Logging
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
            min_revit_version TEXT NOT NULL DEFAULT 'Win10+',
            max_revit_version TEXT NOT NULL DEFAULT 'Win11',
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
            customer_name TEXT,
            plan_code TEXT NOT NULL,
            term_months INTEGER NOT NULL,
            amount_inr REAL NOT NULL,
            status TEXT NOT NULL DEFAULT 'PENDING',
            notes TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
    `);

    seedDefaultData();
}

function seedDefaultData() {
    const now = new Date().toISOString();

    // 1. Seed Pricing Plans (with 30% higher duration discount & 5% renewal discount)
    const plans = [
        {
            id: 'monthly',
            name: 'Monthly Professional',
            duration_months: 1,
            new_customer_price_inr: 2999.00,
            renewal_price_inr: 2849.00, // 5% renewal discount
            description: 'Full access to AAI 3D Desktop Modeler, SketchUp Push/Pull editing, Revit drafting & Vastu Engine.',
            terms: 'Billed monthly. Cancel anytime.'
        },
        {
            id: 'quarterly',
            name: 'Quarterly Commercial (3 Months)',
            duration_months: 3,
            new_customer_price_inr: 6299.00, // ~30% discount
            renewal_price_inr: 5984.00,
            description: 'Includes priority updates, multi-sheet vector PDF exports, and IFC 4.3 BIM export.',
            terms: 'Billed every 3 months.'
        },
        {
            id: 'half_yearly',
            name: 'Half-Yearly Studio (6 Months)',
            duration_months: 6,
            new_customer_price_inr: 12599.00, // ~30% discount
            renewal_price_inr: 11969.00,
            description: 'Comprehensive architectural studio license for practice design workflows.',
            terms: 'Billed every 6 months.'
        },
        {
            id: 'yearly',
            name: 'Annual Enterprise (12 Months)',
            duration_months: 12,
            new_customer_price_inr: 20999.00, // Maximum value tier
            renewal_price_inr: 19949.00,
            description: 'Full commercial license with direct developer support via WhatsApp and custom family templates.',
            terms: 'Billed annually.'
        }
    ];

    const insertPlan = db.prepare(`
        INSERT INTO pricing_plans (id, name, duration_months, new_customer_price_inr, renewal_price_inr, description, terms, updated_at)
        VALUES (@id, @name, @duration_months, @new_customer_price_inr, @renewal_price_inr, @description, @terms, @updated_at)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            duration_months = excluded.duration_months,
            new_customer_price_inr = excluded.new_customer_price_inr,
            renewal_price_inr = excluded.renewal_price_inr,
            description = excluded.description,
            terms = excluded.terms,
            updated_at = excluded.updated_at
    `);

    for (const plan of plans) {
        insertPlan.run({ ...plan, updated_at: now });
    }

    // 2. Seed Default Settings
    const defaultSettings = [
        ['platform_name', 'AAI 3D Licensing & Distribution Platform'],
        ['developer_name', 'Aadesh Navade'],
        ['developer_whatsapp', '+91 93411 02949'],
        ['whatsapp_url', 'https://wa.me/919341102949'],
        ['default_reauth_days', '7'],
        ['offline_grace_hours', '48'],
        ['duration_discount_percent', '30'],
        ['renewal_discount_percent', '5'],
        ['system_currency', 'INR']
    ];

    const insertSetting = db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);

    for (const [k, v] of defaultSettings) {
        insertSetting.run(k, v, now);
    }

    // 3. Seed Primary Administrator (Aadesh Navade)
    const adminEmail = 'aadeshnavade@gmail.com';
    const passwordHash = bcrypt.hashSync('AdminPassword123!', 10);

    const existingAdmin = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
    let masterUserId = existingAdmin ? existingAdmin.id : 'usr_admin_master';

    if (!existingAdmin) {
        db.prepare(`
            INSERT INTO users (id, email, password_hash, full_name, company, role, is_approved, created_at, updated_at)
            VALUES (?, ?, ?, 'Aadesh Navade', 'Ancient Advanced India', 'super_admin', 1, ?, ?)
        `).run(masterUserId, adminEmail, passwordHash, now, now);
    } else {
        db.prepare(`
            UPDATE users SET password_hash = ?, role = 'super_admin', is_approved = 1, updated_at = ?
            WHERE id = ?
        `).run(passwordHash, now, masterUserId);
    }

    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 5);

    const masterSub = db.prepare('SELECT id FROM subscriptions WHERE user_id = ?').get(masterUserId);
    if (!masterSub) {
        db.prepare(`
            INSERT INTO subscriptions (id, user_id, status, plan_code, start_date, expiry_date, reauth_interval_days, created_at, updated_at)
            VALUES (?, ?, 'ACTIVE', 'yearly', ?, ?, 365, ?, ?)
        `).run('sub_admin_master', masterUserId, now, expiryDate.toISOString(), now, now);
    } else {
        db.prepare(`
            UPDATE subscriptions SET status = 'ACTIVE', expiry_date = ?, reauth_interval_days = 365, updated_at = ?
            WHERE user_id = ?
        `).run(expiryDate.toISOString(), now, masterUserId);
    }

    // Secondary test accounts
    const seedAccounts = [
        {
            email: 'aadeshchess40@gmail.com',
            name: 'Aadesh Navade',
            company: 'AAI 3D',
            role: 'customer',
            isApproved: 1,
            password: 'Password123!',
            planCode: 'monthly'
        },
        {
            email: 'testuser@architect.com',
            name: 'Test Architect',
            company: 'AAI BIM Studio',
            role: 'customer',
            isApproved: 1,
            password: 'Password123!',
            planCode: 'yearly'
        }
    ];

    for (const acc of seedAccounts) {
        const u = db.prepare('SELECT id FROM users WHERE email = ?').get(acc.email);
        const passHash = bcrypt.hashSync(acc.password, 10);
        let uid;
        if (!u) {
            uid = 'usr_' + Math.random().toString(36).substring(2, 9);
            db.prepare(`
                INSERT INTO users (id, email, password_hash, full_name, company, role, is_approved, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(uid, acc.email, passHash, acc.name, acc.company, acc.role, acc.isApproved, now, now);
        } else {
            uid = u.id;
            db.prepare('UPDATE users SET password_hash = ?, is_approved = 1 WHERE email = ?').run(passHash, acc.email);
        }

        const sub = db.prepare('SELECT id FROM subscriptions WHERE user_id = ?').get(uid);
        const subExpiry = new Date();
        subExpiry.setFullYear(subExpiry.getFullYear() + 2);
        if (!sub) {
            db.prepare(`
                INSERT INTO subscriptions (id, user_id, status, plan_code, start_date, expiry_date, reauth_interval_days, created_at, updated_at)
                VALUES (?, ?, 'ACTIVE', ?, ?, ?, 7, ?, ?)
            `).run('sub_' + Math.random().toString(36).substring(2, 9), uid, acc.planCode, now, subExpiry.toISOString(), now, now);
        } else {
            db.prepare(`
                UPDATE subscriptions SET status = 'ACTIVE', expiry_date = ?, reauth_interval_days = 7 WHERE user_id = ?
            `).run(subExpiry.toISOString(), uid);
        }
    }

    // 4. Seed Latest Release: AAI 3D Setup 1.0.0.exe
    const possibleDirs = [
        path.join(process.cwd(), 'releases'),
        path.join(__dirname, '..', '..', 'releases'),
        path.join(__dirname, '..', '..', '..', 'Releases')
    ];

    let foundInstaller = null;
    let foundFileName = 'AAI 3D Setup 1.0.0.exe';
    for (const d of possibleDirs) {
        const testPath = path.join(d, foundFileName);
        if (fs.existsSync(testPath)) {
            foundInstaller = testPath;
            break;
        }
    }

    if (foundInstaller) {
        const stats = fs.statSync(foundInstaller);
        db.prepare('UPDATE releases SET is_active = 0 WHERE version_number != ?').run('1.0.0');

        const upsertRelease = db.prepare(`
            INSERT INTO releases
            (id, version_number, release_date, min_revit_version, max_revit_version, file_path, file_name, file_size_bytes, release_notes, is_active, is_mandatory, created_at)
            VALUES (?, ?, ?, 'Win10', 'Win11', ?, ?, ?, ?, 1, 0, ?)
            ON CONFLICT(version_number) DO UPDATE SET
                file_path = excluded.file_path,
                file_name = excluded.file_name,
                file_size_bytes = excluded.file_size_bytes,
                release_notes = excluded.release_notes,
                is_active = 1,
                release_date = excluded.release_date
        `);

        upsertRelease.run(
            'rel_v1.0.0',
            '1.0.0',
            now,
            foundInstaller,
            foundFileName,
            stats.size,
            'AAI 3D v1.0.0: Autonomous AI Architectural Modeler with direct on-screen SketchUp-style Push/Pull editing, Revit-style detailing & auto-dimensioning, 9-zone Vastu Shastra engine, and buildingSMART IFC 4.3 export.',
            now
        );
    }
}

initSchema();

module.exports = db;
