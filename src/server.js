const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const licensingRoutes = require('./routes/licensingRoutes');
const pricingRoutes = require('./routes/pricingRoutes');
const adminRoutes = require('./routes/adminRoutes');
const releasesRoutes = require('./routes/releasesRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/license', licensingRoutes);
app.use('/api/v1/pricing', pricingRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/updates', releasesRoutes);
app.use('/api/v1/releases', releasesRoutes);

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'UP',
        timestamp: new Date().toISOString(),
        service: 'AAI DIM Licensing & Subscription Platform'
    });
});

// Single Page Application fallback for web navigation
app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
        return res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
    }
    next();
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        success: false,
        error: err.message || 'Internal server error'
    });
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`=======================================================`);
        console.log(`  AAI DIM Licensing Platform running on port ${PORT}`);
        console.log(`  Local Web Portal: http://localhost:${PORT}`);
        console.log(`  API Health: http://localhost:${PORT}/health`);
        console.log(`=======================================================`);
    });
}

module.exports = app;
