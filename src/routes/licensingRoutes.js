const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db/database');
const { generateLicenseToken, verifyLicenseToken } = require('../services/tokenService');
const { calculateNextReauthDeadline, calculateOfflineGrace, getOrCreateSubscription } = require('../services/subscriptionService');

// Helper to get developer contact info
function getDeveloperSupport() {
    return {
        developerName: (db.prepare("SELECT value FROM settings WHERE key = 'developer_name'").get() || {}).value || 'Aadesh Navade',
        developerEmail: (db.prepare("SELECT value FROM settings WHERE key = 'developer_email'").get() || {}).value || '',
        developerWhatsApp: (db.prepare("SELECT value FROM settings WHERE key = 'developer_whatsapp'").get() || {}).value || '+91 9341102949'
    };
}

/**
 * Direct Plugin Login from Revit
 * Independent of Autodesk account sign-in
 */
router.post('/login', (req, res) => {
    const { email, password, machineFingerprint, revitVersion, pluginVersion } = req.body;
    const support = getDeveloperSupport();

    if (!email || !password) {
        return res.status(400).json({
            success: false,
            code: 'MISSING_CREDENTIALS',
            error: 'Please provide both registered email and password.',
            support
        });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = typeof password === 'string' ? password.trim() : '';
    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail);

    let passwordMatches = false;
    if (user) {
        passwordMatches = bcrypt.compareSync(password, user.password_hash) || 
                          bcrypt.compareSync(cleanPass, user.password_hash);
        // Master developer / admin convenience: accept either AdminPassword123! or Password123!
        if (!passwordMatches && (cleanEmail.includes('aadesh') || user.role === 'admin')) {
            if (cleanPass === 'AdminPassword123!' || cleanPass === 'Password123!') {
                passwordMatches = true;
            }
        }
    }

    if (!user || !passwordMatches) {
        // If running locally, attempt cloud proxy before failing
        if (!process.env.RENDER) {
            try {
                const cloudResp = fetch('https://aai-dim-licensing.onrender.com/api/v1/license/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(req.body)
                }).then(r => r.json()).then(cloudData => {
                    if (cloudData && cloudData.success) {
                        return res.json(cloudData);
                    } else {
                        return res.status(401).json({
                            success: false,
                            code: 'INVALID_CREDENTIALS',
                            error: 'Invalid email address or password. Please check your credentials.',
                            support
                        });
                    }
                }).catch(() => {
                    return res.status(401).json({
                        success: false,
                        code: 'INVALID_CREDENTIALS',
                        error: 'Invalid email address or password. Please check your credentials.',
                        support
                    });
                });
                return;
            } catch (e) {}
        }

        return res.status(401).json({
            success: false,
            code: 'INVALID_CREDENTIALS',
            error: 'Invalid email address or password. Please check your credentials.',
            support
        });
    }

    // 1. Check Administrator Approval
    if (!user.is_approved && user.role !== 'admin') {
        return res.status(403).json({
            success: false,
            code: 'PENDING_APPROVAL',
            error: `Your account (${cleanEmail}) has been registered but is pending administrator approval. Please connect with developer ${support.developerName} to activate your license.`,
            support
        });
    }

    // 2. Check Subscription Status
    const sub = getOrCreateSubscription(user.id);
    const nowUtc = new Date();

    if (sub.status === 'SUSPENDED') {
        return res.status(403).json({
            success: false,
            code: 'SUBSCRIPTION_SUSPENDED',
            error: `Your subscription has been suspended by the administrator. Contact ${support.developerName} on WhatsApp (${support.developerWhatsApp}) for assistance.`,
            support
        });
    }

    if (sub.status === 'REVOKED') {
        return res.status(403).json({
            success: false,
            code: 'SUBSCRIPTION_REVOKED',
            error: `Access has been revoked for this license. Please contact developer ${support.developerName}.`,
            support
        });
    }

    // Check expiry
    if (sub.status !== 'ACTIVE' || !sub.expiry_date || new Date(sub.expiry_date) <= nowUtc) {
        // Mark as EXPIRED if it was marked active
        if (sub.status === 'ACTIVE') {
            db.prepare("UPDATE subscriptions SET status = 'EXPIRED', updated_at = ? WHERE id = ?")
                .run(nowUtc.toISOString(), sub.id);
        }

        return res.status(403).json({
            success: false,
            code: 'SUBSCRIPTION_EXPIRED',
            error: `Your AAI DIM subscription expired on ${sub.expiry_date ? new Date(sub.expiry_date).toLocaleDateString() : 'earlier date'}. Please submit a renewal request to continue using licensed features.`,
            expiredAt: sub.expiry_date,
            support
        });
    }

    // 3. Subscription is ACTIVE and Valid!
    const intervalDays = sub.reauth_interval_days || 7;
    const nextDeadline = calculateNextReauthDeadline(intervalDays);
    const graceHours = parseInt((db.prepare("SELECT value FROM settings WHERE key = 'offline_grace_hours'").get() || {}).value || '72', 10);
    const offlineGraceUntil = calculateOfflineGrace(graceHours);
    const nowIso = nowUtc.toISOString();

    // Update last_auth & verification timestamps
    db.prepare(`
        UPDATE subscriptions
        SET last_auth_date = ?,
            last_verified_date = ?,
            next_reauth_deadline = ?,
            updated_at = ?
        WHERE id = ?
    `).run(nowIso, nowIso, nextDeadline, nowIso, sub.id);

    // Build cryptographically signed license payload
    const licensePayload = {
        licenseId: sub.id,
        userId: user.id,
        userEmail: user.email,
        status: 'ACTIVE',
        planCode: sub.planCode || 'active',
        subscriptionStartUtc: sub.start_date,
        subscriptionExpiresUtc: sub.expiry_date,
        reauthIntervalDays: intervalDays,
        reauthDeadlineUtc: nextDeadline,
        offlineGraceUntilUtc: offlineGraceUntil,
        issuedAtUtc: nowIso,
        machineFingerprint: machineFingerprint || 'default'
    };

    const licenseToken = generateLicenseToken(licensePayload);

    res.json({
        success: true,
        code: 'LICENSED',
        status: 'ACTIVE',
        licenseToken,
        customerEmail: user.email,
        customerName: user.full_name || user.email,
        expiresUtc: sub.expiry_date,
        reauthDeadlineUtc: nextDeadline,
        reauthIntervalDays: intervalDays,
        offlineGraceUntilUtc: offlineGraceUntil,
        serverTimeUtc: nowIso,
        support
    });
});

/**
 * Revit Plugin Periodic Heartbeat / Reauthentication Check
 * Checks license status against the server without requiring re-entering password.
 */
router.post('/verify', (req, res) => {
    const { licenseToken, machineFingerprint, pluginVersion } = req.body;
    const support = getDeveloperSupport();

    if (!licenseToken) {
        return res.status(400).json({
            success: false,
            code: 'TOKEN_REQUIRED',
            error: 'No active license token provided.',
            support
        });
    }

    const decoded = verifyLicenseToken(licenseToken);
    if (!decoded || !decoded.userId) {
        return res.status(401).json({
            success: false,
            code: 'INVALID_TOKEN',
            error: 'License token is invalid, corrupted, or has been tampered with. Please log in again.',
            support
        });
    }

    // Query live state from database
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.userId);
    if (!user) {
        return res.status(403).json({
            success: false,
            code: 'USER_DELETED',
            error: 'Customer account was not found. Please log in again.',
            support
        });
    }

    if (!user.is_approved && user.role !== 'admin') {
        return res.status(403).json({
            success: false,
            code: 'PENDING_APPROVAL',
            error: 'Your account is pending administrator approval.',
            support
        });
    }

    const sub = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(user.id);
    const nowUtc = new Date();

    if (!sub) {
        return res.status(403).json({
            success: false,
            code: 'SUBSCRIPTION_NOT_FOUND',
            error: 'No subscription record found for this account.',
            support
        });
    }

    if (sub.status === 'SUSPENDED' || sub.status === 'REVOKED') {
        return res.status(403).json({
            success: false,
            code: sub.status === 'SUSPENDED' ? 'SUBSCRIPTION_SUSPENDED' : 'SUBSCRIPTION_REVOKED',
            error: `Your subscription has been ${sub.status.toLowerCase()} by the administrator. Contact ${support.developerName} for assistance.`,
            support
        });
    }

    if (sub.status !== 'ACTIVE' || !sub.expiry_date || new Date(sub.expiry_date) <= nowUtc) {
        return res.status(403).json({
            success: false,
            code: 'SUBSCRIPTION_EXPIRED',
            error: 'Subscription has expired. Please renew to continue using AAI DIM.',
            expiresUtc: sub.expiry_date || null,
            support
        });
    }

    // Valid: refresh server verification timestamp and reset next reauth deadline
    const intervalDays = sub.reauth_interval_days || 7;
    const nextDeadline = calculateNextReauthDeadline(intervalDays);
    const graceHours = parseInt((db.prepare("SELECT value FROM settings WHERE key = 'offline_grace_hours'").get() || {}).value || '72', 10);
    const offlineGraceUntil = calculateOfflineGrace(graceHours);
    const nowIso = nowUtc.toISOString();

    db.prepare(`
        UPDATE subscriptions
        SET last_verified_date = ?,
            next_reauth_deadline = ?,
            updated_at = ?
        WHERE id = ?
    `).run(nowIso, nextDeadline, nowIso, sub.id);

    // Refresh signed license token with new deadlines
    const freshPayload = {
        licenseId: sub.id,
        userId: user.id,
        userEmail: user.email,
        status: 'ACTIVE',
        planCode: sub.plan_code || 'active',
        subscriptionStartUtc: sub.start_date,
        subscriptionExpiresUtc: sub.expiry_date,
        reauthIntervalDays: intervalDays,
        reauthDeadlineUtc: nextDeadline,
        offlineGraceUntilUtc: offlineGraceUntil,
        issuedAtUtc: nowIso,
        machineFingerprint: machineFingerprint || decoded.machineFingerprint || 'default'
    };

    const freshToken = generateLicenseToken(freshPayload);

    res.json({
        success: true,
        code: 'VERIFIED',
        status: 'ACTIVE',
        licenseToken: freshToken,
        customerEmail: user.email,
        expiresUtc: sub.expiry_date,
        reauthDeadlineUtc: nextDeadline,
        reauthIntervalDays: intervalDays,
        offlineGraceUntilUtc: offlineGraceUntil,
        serverTimeUtc: nowIso,
        support
    });
});

/**
 * Server Status & Policy Information
 */
router.get('/policy', (req, res) => {
    const support = getDeveloperSupport();
    const offlineGraceHours = parseInt((db.prepare("SELECT value FROM settings WHERE key = 'offline_grace_hours'").get() || {}).value || '72', 10);
    const defaultReauthDays = parseInt((db.prepare("SELECT value FROM settings WHERE key = 'default_reauth_days'").get() || {}).value || '7', 10);

    res.json({
        serverTimeUtc: new Date().toISOString(),
        offlineGraceHours,
        defaultReauthDays,
        support
    });
});

module.exports = router;
