const http = require('http');
const app = require('../src/server');

const PORT = 5599;
let server;

function request(method, path, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const reqHeaders = { ...headers };
        let reqBody = null;
        if (body) {
            reqBody = JSON.stringify(body);
            reqHeaders['Content-Type'] = 'application/json';
            reqHeaders['Content-Length'] = Buffer.byteLength(reqBody);
        }

        const req = http.request({
            hostname: '127.0.0.1',
            port: PORT,
            path,
            method,
            headers: reqHeaders
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ status: res.statusCode, data: parsed });
                } catch (e) {
                    resolve({ status: res.statusCode, raw: data });
                }
            });
        });

        req.on('error', reject);
        if (reqBody) req.write(reqBody);
        req.end();
    });
}

async function runTests() {
    console.log('--- STARTING COMPREHENSIVE LICENSING PLATFORM TEST SUITE ---');
    server = app.listen(PORT);

    try {
        // 1. Health check
        console.log('1. Testing /health...');
        const h = await request('GET', '/health');
        if (h.status !== 200 || h.data.status !== 'UP') throw new Error('Health check failed');
        console.log('   ✅ Health check passed.');

        // 2. Initial Admin Setup or Login
        console.log('2. Testing Admin Setup/Login...');
        let adminToken;
        const checkSetup = await request('GET', '/api/v1/auth/setup-status');
        if (!checkSetup.data.adminExists) {
            const adminSetup = await request('POST', '/api/v1/auth/setup-admin', {
                email: 'admin@aaidim.com',
                password: 'AdminPassword123!',
                fullName: 'Master Administrator'
            });
            adminToken = adminSetup.data.token;
            console.log('   ✅ Master admin created successfully.');
        } else {
            const adminLogin = await request('POST', '/api/v1/auth/login', {
                email: 'admin@aaidim.com',
                password: 'AdminPassword123!'
            });
            adminToken = adminLogin.data.token;
            console.log('   ✅ Master admin authenticated successfully.');
        }

        // 3. Configure Developer Settings (Developer Name: Aadesh Navade, Email, WhatsApp)
        console.log('3. Testing Platform Settings Update...');
        const setRes = await request('POST', '/api/v1/admin/settings', {
            settings: {
                developer_name: 'Aadesh Navade',
                developer_email: 'aadeshnavade@gmail.com',
                developer_whatsapp: '+91 9341102949',
                default_reauth_days: '7',
                offline_grace_hours: '72',
                subscription_terms: 'Full commercial license with AI Copilot and all future updates.',
                refund_policy: 'Contact developer prior to payment. 7-day technical evaluation support provided.'
            }
        }, { 'Authorization': `Bearer ${adminToken}` });
        if (setRes.status !== 200) throw new Error('Settings update failed');
        console.log('   ✅ Platform settings configured (Aadesh Navade / +91 9341102949 / aadeshnavade@gmail.com).');

        // 4. Public Pricing & Phase 6 Email Purchase Request
        console.log('4. Testing Public Pricing & Phase 6 Purchase Request...');
        const pricingRes = await request('GET', '/api/v1/pricing/public');
        if (pricingRes.status !== 200 || pricingRes.data.plans.length < 3) throw new Error('Pricing fetch failed');
        console.log(`   ✅ Fetched ${pricingRes.data.plans.length} plans in ${pricingRes.data.currency} (₹).`);

        const purchaseReq = await request('POST', '/api/v1/pricing/request-purchase', {
            planId: 'monthly',
            customerEmail: 'customer1@architect.com',
            requestType: 'NEW'
        });
        if (purchaseReq.status !== 200 || !purchaseReq.data.mailtoUrl) {
            throw new Error('Purchase request generation failed: ' + JSON.stringify(purchaseReq.data));
        }
        if (!purchaseReq.data.mailtoUrl.includes('mailto:aadeshnavade%40gmail.com')) {
            throw new Error('Mailto link does not target configured developer email');
        }
        console.log('   ✅ Phase 6 email purchase request generated successfully with target aadeshnavade@gmail.com.');

        // 5. Customer Registration
        console.log('5. Testing Customer Registration / Lookup...');
        const testEmail = `cust_${Date.now()}@architect.com`;
        const regRes = await request('POST', '/api/v1/auth/register', {
            fullName: 'Jane Architect',
            company: 'Studio Axis',
            email: testEmail,
            password: 'CustomerPass123!'
        });
        if (regRes.status !== 200 || !regRes.data.user) throw new Error('Customer registration failed: ' + JSON.stringify(regRes.data));
        const customerId = regRes.data.user.id;
        console.log(`   ✅ Customer registered (${testEmail}, pending approval).`);

        // 6. Verify Unapproved Customer is Blocked from Plugin
        console.log('6. Testing Plugin Login with Unapproved Account (Must be Blocked)...');
        const unapprovedLogin = await request('POST', '/api/v1/license/login', {
            email: testEmail,
            password: 'CustomerPass123!',
            revitVersion: '2026',
            pluginVersion: '1.0.0'
        });
        if (unapprovedLogin.status !== 403 || unapprovedLogin.data.code !== 'PENDING_APPROVAL') {
            throw new Error('Expected 403 PENDING_APPROVAL, got: ' + JSON.stringify(unapprovedLogin.data));
        }
        console.log('   ✅ Plugin correctly blocked unapproved customer with helpful message and developer contact.');

        // 7. Admin Approves Customer
        console.log('7. Testing Admin Customer Approval...');
        const approveRes = await request('POST', `/api/v1/admin/customers/${customerId}/approve`, {
            approve: true
        }, { 'Authorization': `Bearer ${adminToken}` });
        if (approveRes.status !== 200) throw new Error('Customer approval failed');
        console.log('   ✅ Customer approved by administrator.');

        // 8. Admin Activates 1-Month Subscription
        console.log('8. Testing Manual Subscription Activation...');
        const actRes = await request('POST', `/api/v1/admin/customers/${customerId}/subscription/activate`, {
            planCode: 'monthly',
            durationMonths: 1,
            reauthIntervalDays: 7,
            paymentRef: 'UPI_MANUAL_CONFIRMED_#9871',
            notes: 'Payment confirmed via email with developer.'
        }, { 'Authorization': `Bearer ${adminToken}` });
        if (actRes.status !== 200 || actRes.data.subscription.status !== 'ACTIVE') {
            throw new Error('Subscription activation failed: ' + JSON.stringify(actRes.data));
        }
        console.log(`   ✅ 1-Month subscription activated (Expires: ${actRes.data.subscription.expiry_date}).`);

        // 9. Plugin Login with Active Account
        console.log('9. Testing Plugin Login with Active Account...');
        const pluginLogin = await request('POST', '/api/v1/license/login', {
            email: testEmail,
            password: 'CustomerPass123!',
            machineFingerprint: 'TEST_MACHINE_FINGERPRINT_123',
            revitVersion: '2026',
            pluginVersion: '1.0.0'
        });
        if (pluginLogin.status !== 200 || !pluginLogin.data.licenseToken) {
            throw new Error('Plugin login failed: ' + JSON.stringify(pluginLogin.data));
        }
        const licenseToken = pluginLogin.data.licenseToken;
        console.log('   ✅ Plugin login succeeded! Received signed cryptographic license token.');

        // 10. Plugin Heartbeat / Reauthentication Verification
        console.log('10. Testing Plugin Verification / Heartbeat...');
        const verifyRes = await request('POST', '/api/v1/license/verify', {
            licenseToken,
            machineFingerprint: 'TEST_MACHINE_FINGERPRINT_123',
            pluginVersion: '1.0.0'
        });
        if (verifyRes.status !== 200 || verifyRes.data.code !== 'VERIFIED') {
            throw new Error('Plugin verification failed: ' + JSON.stringify(verifyRes.data));
        }
        console.log('   ✅ Plugin verification verified by server UTC authority.');

        // 11. Changing Reauth Interval from 7 Days to 14 Days WITHOUT rebuilding plugin
        console.log('11. Testing Reauthentication Interval Change Without Rebuilding Plugin...');
        const intervalRes = await request('POST', `/api/v1/admin/customers/${customerId}/reauth-interval`, {
            intervalDays: 14
        }, { 'Authorization': `Bearer ${adminToken}` });
        if (intervalRes.status !== 200 || intervalRes.data.reauthIntervalDays !== 14) {
            throw new Error('Interval update failed');
        }

        const verifyAfterInterval = await request('POST', '/api/v1/license/verify', {
            licenseToken: verifyRes.data.licenseToken,
            pluginVersion: '1.0.0'
        });
        if (verifyAfterInterval.data.reauthIntervalDays !== 14) {
            throw new Error('Plugin did not reflect updated reauth interval!');
        }
        console.log('   ✅ Reauth interval updated to 14 days and immediately recognized by plugin without rebuild!');

        // 12. Suspension Test
        console.log('12. Testing Subscription Suspension...');
        const suspendRes = await request('POST', `/api/v1/admin/customers/${customerId}/subscription/status`, {
            status: 'SUSPENDED',
            reason: 'Temporary hold by admin'
        }, { 'Authorization': `Bearer ${adminToken}` });
        if (suspendRes.status !== 200) throw new Error('Suspension failed');

        const verifySuspended = await request('POST', '/api/v1/license/verify', {
            licenseToken: verifyAfterInterval.data.licenseToken,
            pluginVersion: '1.0.0'
        });
        if (verifySuspended.status !== 403 || verifySuspended.data.code !== 'SUBSCRIPTION_SUSPENDED') {
            throw new Error('Suspended user was not blocked!');
        }
        console.log('   ✅ Suspended customer immediately blocked from Revit plugin.');

        // 13. Reactivate Subscription & Audit Log Check
        console.log('13. Reactivating Customer and Verifying Audit Logs...');
        await request('POST', `/api/v1/admin/customers/${customerId}/subscription/status`, {
            status: 'ACTIVE'
        }, { 'Authorization': `Bearer ${adminToken}` });

        const auditRes = await request('GET', '/api/v1/admin/audit-logs', null, {
            'Authorization': `Bearer ${adminToken}`
        });
        if (auditRes.status !== 200 || auditRes.data.logs.length < 5) {
            throw new Error('Audit logs missing entries');
        }
        console.log(`   ✅ Audit trail verified (${auditRes.data.logs.length} logged administrative operations).`);

        // 14. Version Update Checker
        console.log('14. Testing Version Update Checker...');
        const updateCheck = await request('GET', '/api/v1/updates/check?current_version=0.9.0&revit_version=2026');
        if (updateCheck.status !== 200 || !updateCheck.data.updateAvailable) {
            throw new Error('Update check failed: ' + JSON.stringify(updateCheck.data));
        }
        console.log(`   ✅ Update checker successfully identified latest release v${updateCheck.data.latestVersion}.`);

        console.log('\n=============================================================');
        console.log(' 🎉 ALL 14 LICENSING PLATFORM INTEGRATION TESTS PASSED 100%!');
        console.log('=============================================================\n');

    } catch (err) {
        console.error('❌ TEST FAILED:', err);
        process.exitCode = 1;
    } finally {
        if (server) server.close();
    }
}

runTests();
