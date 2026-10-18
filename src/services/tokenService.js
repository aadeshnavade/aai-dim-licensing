const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../db/database');

function getJwtSecret() {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('jwt_secret');
    return (row && row.value) ? row.value : 'fallback_super_secret_key_change_in_production';
}

function generateWebToken(user) {
    const secret = getJwtSecret();
    return jwt.sign(
        {
            id: user.id,
            email: user.email,
            role: user.role,
            isApproved: user.is_approved
        },
        secret,
        { expiresIn: '7d' }
    );
}

function verifyWebToken(token) {
    try {
        const secret = getJwtSecret();
        return jwt.verify(token, secret);
    } catch (e) {
        return null;
    }
}

/**
 * Generates a cryptographically signed license payload for the Revit plugin.
 */
function generateLicenseToken(payload) {
    const secret = getJwtSecret();
    const tokenString = jwt.sign(payload, secret, {
        algorithm: 'HS256',
        expiresIn: '365d' // Expiry inside payload is strictly checked by plugin & server
    });
    return tokenString;
}

function verifyLicenseToken(token) {
    try {
        const secret = getJwtSecret();
        return jwt.verify(token, secret, { algorithms: ['HS256'] });
    } catch (e) {
        return null;
    }
}

module.exports = {
    generateWebToken,
    verifyWebToken,
    generateLicenseToken,
    verifyLicenseToken,
    getJwtSecret
};
