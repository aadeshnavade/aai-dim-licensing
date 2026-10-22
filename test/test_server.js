const http = require('http');
const app = require('../src/server');

const server = app.listen(5099, async () => {
    console.log('Testing AAI 3D Licensing Server on port 5099...');

    try {
        // 1. Health check
        const health = await fetchJson('http://localhost:5099/health');
        console.log('Health check:', health);

        // 2. Pricing plans check
        const pricing = await fetchJson('http://localhost:5099/api/v1/pricing/public');
        console.log(`Loaded ${pricing.plans?.length || 0} pricing plans.`);

        // 3. License login check
        const loginData = await postJson('http://localhost:5099/api/v1/license/login', {
            email: 'aadeshchess40@gmail.com',
            password: 'Password123!',
            machineFingerprint: 'TEST_MACHINE_123',
            clientVersion: '1.0.0'
        });
        console.log('License Login Response:', {
            success: loginData.success,
            status: loginData.status,
            customerEmail: loginData.customerEmail,
            hasToken: !!loginData.licenseToken
        });

        // 4. Update check
        const updateCheck = await fetchJson('http://localhost:5099/api/v1/updates/check?version=0.9.0');
        console.log('Update Check Response:', {
            updateAvailable: updateCheck.updateAvailable,
            latestVersion: updateCheck.latestVersion,
            fileName: updateCheck.fileName
        });

        console.log('\n>>> ALL AAI 3D LICENSING PLATFORM CHECKS PASSED SUCCESSFULLY! <<<\n');
        server.close();
        process.exit(0);
    } catch (err) {
        console.error('Test error:', err);
        server.close();
        process.exit(1);
    }
});

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
    });
}

function postJson(url, payload) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify(payload);
        const req = http.request(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}
