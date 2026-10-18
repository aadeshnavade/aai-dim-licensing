const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');

function getPlatformSettings() {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const map = {};
    for (const r of rows) map[r.key] = r.value;
    return {
        developerName: map.developer_name || 'Aadesh Navade',
        developerEmail: map.developer_email || '',
        developerWhatsApp: map.developer_whatsapp || '+91 9341102949',
        productName: map.product_name || 'AAI DIM',
        productDescription: map.product_description || 'Autonomous BIM Architectural Dimensioning & Advanced Digital Twin AI Copilot for Autodesk Revit',
        subscriptionTerms: map.subscription_terms || 'Subscriptions are billed for the selected calendar duration in INR.',
        refundPolicy: map.refund_policy || 'Please review feature compatibility before purchasing.'
    };
}

/**
 * Public Pricing & Plans
 */
router.get('/public', (req, res) => {
    const plans = db.prepare(`
        SELECT id, name, duration_months, new_customer_price_inr, renewal_price_inr, description, terms, is_enabled
        FROM pricing_plans
        WHERE is_enabled = 1
        ORDER BY duration_months ASC
    `).all();

    const settings = getPlatformSettings();

    res.json({
        success: true,
        currency: 'INR',
        currencySymbol: '₹',
        plans: plans.map(p => ({
            id: p.id,
            name: p.name,
            durationMonths: p.duration_months,
            durationLabel: p.duration_months === 1 ? '1 Month' : `${p.duration_months} Months`,
            newCustomerPriceInr: p.new_customer_price_inr,
            renewalPriceInr: p.renewal_price_inr,
            description: p.description,
            terms: p.terms
        })),
        settings: {
            developerName: settings.developerName,
            developerEmailConfigured: Boolean(settings.developerEmail && settings.developerEmail.trim().length > 0),
            developerEmail: settings.developerEmail,
            developerWhatsApp: settings.developerWhatsApp,
            productName: settings.productName,
            productDescription: settings.productDescription,
            subscriptionTerms: settings.subscriptionTerms,
            refundPolicy: settings.refundPolicy
        }
    });
});

/**
 * Authenticated Customer Pricing (Shows renewal rates and active discounts)
 */
router.get('/customer-plans', requireAuth, (req, res) => {
    const user = req.user;
    const sub = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(user.id);
    const plans = db.prepare('SELECT * FROM pricing_plans WHERE is_enabled = 1 ORDER BY duration_months ASC').all();
    const settings = getPlatformSettings();

    const isExistingCustomer = sub && (sub.status === 'ACTIVE' || sub.status === 'EXPIRED');

    const customerPlans = plans.map(p => {
        let effectivePrice = isExistingCustomer ? p.renewal_price_inr : p.new_customer_price_inr;
        let discountApplied = 0;

        if (sub && sub.discount_inr > 0) {
            discountApplied = sub.discount_inr;
            effectivePrice = Math.max(0, effectivePrice - discountApplied);
        }

        if (sub && sub.negotiated_price_inr !== null && sub.negotiated_price_inr !== undefined && sub.negotiated_price_inr >= 0) {
            effectivePrice = sub.negotiated_price_inr;
        }

        return {
            id: p.id,
            name: p.name,
            durationMonths: p.duration_months,
            durationLabel: p.duration_months === 1 ? '1 Month' : `${p.duration_months} Months`,
            standardNewPriceInr: p.new_customer_price_inr,
            standardRenewalPriceInr: p.renewal_price_inr,
            effectivePriceInr: effectivePrice,
            isRenewalPrice: isExistingCustomer,
            description: p.description,
            terms: p.terms
        };
    });

    res.json({
        success: true,
        currency: 'INR',
        currencySymbol: '₹',
        isExistingCustomer,
        customerPlans,
        settings: {
            developerName: settings.developerName,
            developerEmail: settings.developerEmail,
            developerWhatsApp: settings.developerWhatsApp,
            subscriptionTerms: settings.subscriptionTerms,
            refundPolicy: settings.refundPolicy
        }
    });
});

/**
 * Phase 6: Email-Based Purchase Request Generator
 * Generates dynamic mailto links, prefilled email text, and saves snapshot.
 */
router.post('/request-purchase', (req, res) => {
    const { planId, customerEmail, requestType, customerName } = req.body;
    const settings = getPlatformSettings();

    if (!settings.developerEmail || !settings.developerEmail.trim()) {
        return res.status(400).json({
            success: false,
            code: 'DEVELOPER_EMAIL_NOT_CONFIGURED',
            error: 'The administrator has not yet configured the developer email address. Please connect directly via WhatsApp at ' + settings.developerWhatsApp + ' to request purchase.',
            supportWhatsApp: settings.developerWhatsApp
        });
    }

    const plan = db.prepare('SELECT * FROM pricing_plans WHERE id = ?').get(planId);
    if (!plan) {
        return res.status(404).json({ success: false, error: 'Selected subscription plan not found.' });
    }

    const email = (customerEmail || '').trim();
    if (!email) {
        return res.status(400).json({ success: false, error: 'Customer email address is required.' });
    }

    const isRenewal = requestType === 'RENEWAL' || requestType === 'renewal';
    const applicablePrice = isRenewal ? plan.renewal_price_inr : plan.new_customer_price_inr;
    const durationLabel = plan.duration_months === 1 ? '1 Calendar Month' : `${plan.duration_months} Calendar Months`;
    const typeLabel = isRenewal ? 'Renewal' : 'New Subscription';

    // Subject
    const subject = 'Revit Plugin Subscription Purchase Request';

    // Body formatted per Phase 6 specification
    const bodyLines = [
        'Hello,',
        '',
        'I would like to request a subscription for the Revit plugin.',
        '',
        `Registered email: ${email}`,
        `Subscription plan: ${plan.name}`,
        `Duration: ${durationLabel}`,
        `Displayed price: INR ${applicablePrice.toFixed(2)}`,
        `Request type: ${typeLabel}`,
        '',
        'Please share the payment instructions and let me know how to proceed with activating or renewing my license.',
        '',
        'Thank you.'
    ];

    const rawBody = bodyLines.join('\r\n');
    const mailtoUrl = `mailto:${encodeURIComponent(settings.developerEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(rawBody)}`;

    // Store persistent snapshot record in purchase_requests
    const requestId = 'req_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
    const nowIso = new Date().toISOString();

    db.prepare(`
        INSERT INTO purchase_requests 
        (id, customer_email, plan_code, duration_months, price_inr, request_type, terms_snapshot, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'EMAIL_PREPARED', ?)
    `).run(
        requestId,
        email,
        plan.id,
        plan.duration_months,
        applicablePrice,
        isRenewal ? 'RENEWAL' : 'NEW',
        plan.terms || settings.subscriptionTerms,
        nowIso
    );

    res.json({
        success: true,
        requestId,
        developerEmail: settings.developerEmail,
        developerWhatsApp: settings.developerWhatsApp,
        subject,
        bodyText: rawBody,
        mailtoUrl,
        plan: {
            name: plan.name,
            duration: durationLabel,
            priceInr: applicablePrice,
            type: typeLabel
        },
        notice: 'Please review and send the email from your mail client. Opening an email draft does not automatically submit payment or activate a license. The developer will reply with payment instructions.'
    });
});

module.exports = router;
