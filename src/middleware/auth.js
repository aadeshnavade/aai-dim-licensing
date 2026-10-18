const { verifyWebToken } = require('../services/tokenService');
const db = require('../db/database');

function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Authentication required. Missing token.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyWebToken(token);
    if (!decoded) {
        return res.status(401).json({ success: false, error: 'Invalid or expired session. Please sign in again.' });
    }

    // Verify user still exists in database
    const user = db.prepare('SELECT id, email, role, is_approved, full_name, company FROM users WHERE id = ?').get(decoded.id);
    if (!user) {
        return res.status(401).json({ success: false, error: 'User account no longer exists.' });
    }

    req.user = user;
    next();
}

function requireAdmin(req, res, next) {
    requireAuth(req, res, () => {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'Access denied. Administrator privileges required.' });
        }
        next();
    });
}

function requireApprovedCustomer(req, res, next) {
    requireAuth(req, res, () => {
        if (req.user.role !== 'admin' && !req.user.is_approved) {
            return res.status(403).json({ 
                success: false, 
                error: 'Your account is pending administrator approval. Please contact the administrator to activate your account.' 
            });
        }
        next();
    });
}

module.exports = {
    requireAuth,
    requireAdmin,
    requireApprovedCustomer
};
