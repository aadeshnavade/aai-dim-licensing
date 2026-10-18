const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const db = require('../db/database');
const { verifyWebToken, verifyLicenseToken } = require('../services/tokenService');

// Compare semver strings (e.g., '1.1.0' vs '1.0.0')
function compareVersions(v1, v2) {
    const parts1 = (v1 || '0').split('.').map(n => parseInt(n, 10) || 0);
    const parts2 = (v2 || '0').split('.').map(n => parseInt(n, 10) || 0);
    const maxLen = Math.max(parts1.length, parts2.length);

    for (let i = 0; i < maxLen; i++) {
        const num1 = parts1[i] || 0;
        const num2 = parts2[i] || 0;
        if (num1 > num2) return 1;
        if (num1 < num2) return -1;
    }
    return 0;
}

/**
 * Check for updates (Revit plugin or website check)
 */
router.get('/check', (req, res) => {
    const { current_version, revit_version } = req.query;

    const releases = db.prepare(`
        SELECT * FROM releases 
        WHERE is_active = 1 
        ORDER BY created_at DESC
    `).all();

    if (releases.length === 0) {
        return res.json({
            updateAvailable: false,
            message: 'No published releases currently available.'
        });
    }

    const latest = releases[0];
    const isNewer = current_version ? (compareVersions(latest.version_number, current_version) > 0) : true;

    res.json({
        success: true,
        updateAvailable: isNewer,
        currentVersion: current_version || '1.0.0',
        latestVersion: latest.version_number,
        releaseDate: latest.release_date,
        releaseNotes: latest.release_notes,
        isMandatory: Boolean(latest.is_mandatory),
        downloadUrl: `/api/v1/releases/download/${latest.version_number}`,
        minRevitVersion: latest.min_revit_version,
        maxRevitVersion: latest.max_revit_version
    });
});

/**
 * List all available versions for download (Customer portal)
 */
router.get('/available', (req, res) => {
    const releases = db.prepare(`
        SELECT id, version_number, release_date, min_revit_version, max_revit_version, 
               file_name, file_size_bytes, release_notes, is_mandatory
        FROM releases
        WHERE is_active = 1
        ORDER BY created_at DESC
    `).all();

    res.json({
        success: true,
        releases: releases.map(r => ({
            id: r.id,
            versionNumber: r.version_number,
            releaseDate: r.release_date,
            fileName: r.file_name,
            fileSizeBytes: r.file_size_bytes,
            fileSizeFormatted: (r.file_size_bytes / (1024 * 1024)).toFixed(2) + ' MB',
            minRevitVersion: r.min_revit_version,
            maxRevitVersion: r.max_revit_version,
            releaseNotes: r.release_notes,
            isMandatory: Boolean(r.is_mandatory),
            downloadUrl: `/api/v1/releases/download/${r.version_number}`
        }))
    });
});

/**
 * Download a specific version installer package (.zip)
 * Requires active subscription or admin session (via Authorization header or ?token= query param)
 */
router.get('/download/:version', (req, res) => {
    const { version } = req.params;
    const cleanVer = version.replace(/^v/i, '');

    const rel = db.prepare('SELECT * FROM releases WHERE version_number = ? AND is_active = 1').get(cleanVer);
    if (!rel) {
        return res.status(404).send('Release version not found or no longer active.');
    }

    // Verify authentication
    const authHeader = req.headers.authorization;
    let token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
    if (!token && req.query.token) {
        token = req.query.token;
    }

    if (!token) {
        return res.status(401).send('Authentication required to download plugin updates. Please sign in to your customer portal.');
    }

    // Check token (either web JWT or license token)
    const userPayload = verifyWebToken(token) || verifyLicenseToken(token);
    if (!userPayload || !userPayload.id && !userPayload.userId) {
        return res.status(401).send('Invalid or expired download token. Please refresh your session.');
    }

    const userId = userPayload.id || userPayload.userId;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
        return res.status(403).send('User account not found.');
    }

    // If customer, verify active subscription or approved status
    if (user.role !== 'admin') {
        const sub = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(user.id);
        const nowUtc = new Date();
        if (!sub || sub.status !== 'ACTIVE' || !sub.expiry_date || new Date(sub.expiry_date) <= nowUtc) {
            return res.status(403).send('Active subscription required to download plugin packages. Please renew your license.');
        }
    }

    // File check
    if (!fs.existsSync(rel.file_path)) {
        return res.status(404).send('Release package file is missing on server storage.');
    }

    res.download(rel.file_path, rel.file_name);
});

module.exports = router;
