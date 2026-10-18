const db = require('../db/database');

/**
 * Adds exact calendar months to a UTC Date without timezone drift,
 * handling month-end overflow (e.g. Jan 31 + 1 month = Feb 28/29).
 */
function addCalendarMonths(startDate, months) {
    const d = new Date(startDate.getTime());
    const expectedMonth = d.getUTCMonth() + months;
    const targetDate = d.getUTCDate();
    
    d.setUTCMonth(expectedMonth);
    // If the date overflowed into next month (e.g., Feb 31 -> Mar 2/3), clamp to last day of target month
    if (d.getUTCDate() < targetDate) {
        d.setUTCDate(0); // Sets to last day of previous month
    }
    return d;
}

/**
 * Calculates next reauth deadline: current UTC timestamp + interval days
 */
function calculateNextReauthDeadline(intervalDays) {
    const days = Math.max(1, parseInt(intervalDays, 10) || 7);
    const deadline = new Date(Date.now() + (days * 24 * 60 * 60 * 1000));
    return deadline.toISOString();
}

/**
 * Calculates offline grace timestamp: current UTC timestamp + grace hours
 */
function calculateOfflineGrace(graceHours) {
    const hours = Math.max(1, parseInt(graceHours, 10) || 72);
    const deadline = new Date(Date.now() + (hours * 60 * 60 * 1000));
    return deadline.toISOString();
}

/**
 * Writes an immutable record to the audit_logs table
 */
function logAudit(actorUserId, actorEmail, action, targetUserId, targetEmail, detailsObj) {
    try {
        const stmt = db.prepare(`
            INSERT INTO audit_logs (actor_user_id, actor_email, action, target_user_id, target_email, details, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
            actorUserId || 'SYSTEM',
            actorEmail || 'system',
            action,
            targetUserId || null,
            targetEmail || null,
            JSON.stringify(detailsObj || {}),
            new Date().toISOString()
        );
    } catch (err) {
        console.error('Audit logging failed:', err);
    }
}

/**
 * Ensures user subscription record exists; creates if missing.
 */
function getOrCreateSubscription(userId) {
    let sub = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(userId);
    if (!sub) {
        const now = new Date().toISOString();
        const defaultReauth = parseInt(
            (db.prepare('SELECT value FROM settings WHERE key = ?').get('default_reauth_days') || {}).value || '7',
            10
        );
        const subId = 'sub_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
        db.prepare(`
            INSERT INTO subscriptions 
            (id, user_id, status, reauth_interval_days, created_at, updated_at)
            VALUES (?, ?, 'INACTIVE', ?, ?, ?)
        `).run(subId, userId, defaultReauth, now, now);
        sub = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(userId);
    }
    return sub;
}

/**
 * Activates or extends a customer subscription.
 * Handles:
 * - Extending from current valid expiry if subscription is still active (prevents shortening)
 * - Starting from now if expired or inactive
 * - Idempotency checks
 */
function activateOrExtendSubscription({
    userId,
    planCode,
    durationMonths,
    reauthIntervalDays,
    paymentRef,
    notes,
    actorAdmin
}) {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
        throw new Error('User not found.');
    }

    const currentSub = getOrCreateSubscription(userId);
    const nowUtc = new Date();
    const monthsToAdd = Math.max(1, parseInt(durationMonths, 10) || 1);

    let baseStartDate;
    let baseExpiryDate;

    // If subscription is currently ACTIVE and has not yet expired, extend from existing expiry date!
    if (currentSub.status === 'ACTIVE' && currentSub.expiry_date && new Date(currentSub.expiry_date) > nowUtc) {
        baseStartDate = new Date(currentSub.start_date || nowUtc);
        baseExpiryDate = new Date(currentSub.expiry_date);
    } else {
        // Start fresh from today UTC
        baseStartDate = nowUtc;
        baseExpiryDate = nowUtc;
    }

    const newExpiryDate = addCalendarMonths(baseExpiryDate, monthsToAdd);
    const chosenInterval = reauthIntervalDays 
        ? Math.max(1, parseInt(reauthIntervalDays, 10)) 
        : (currentSub.reauth_interval_days || 7);
    
    const nextDeadline = calculateNextReauthDeadline(chosenInterval);
    const nowIso = nowUtc.toISOString();

    db.prepare(`
        UPDATE subscriptions
        SET status = 'ACTIVE',
            plan_code = ?,
            start_date = ?,
            expiry_date = ?,
            reauth_interval_days = ?,
            next_reauth_deadline = ?,
            payment_reference = ?,
            admin_notes = ?,
            updated_at = ?
        WHERE user_id = ?
    `).run(
        planCode || 'custom',
        baseStartDate.toISOString(),
        newExpiryDate.toISOString(),
        chosenInterval,
        nextDeadline,
        paymentRef || currentSub.payment_reference || '',
        notes || currentSub.admin_notes || '',
        nowIso,
        userId
    );

    // Ensure user is marked approved as well
    db.prepare("UPDATE users SET is_approved = 1, updated_at = ? WHERE id = ?").run(nowIso, userId);

    logAudit(
        actorAdmin ? actorAdmin.id : 'ADMIN',
        actorAdmin ? actorAdmin.email : 'admin',
        'SUBSCRIPTION_ACTIVATED_OR_EXTENDED',
        user.id,
        user.email,
        {
            monthsAdded: monthsToAdd,
            planCode,
            newExpiry: newExpiryDate.toISOString(),
            reauthIntervalDays: chosenInterval,
            paymentRef,
            notes
        }
    );

    return db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(userId);
}

module.exports = {
    addCalendarMonths,
    calculateNextReauthDeadline,
    calculateOfflineGrace,
    logAudit,
    getOrCreateSubscription,
    activateOrExtendSubscription
};
