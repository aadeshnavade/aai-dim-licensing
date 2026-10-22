// State Management
const state = {
    currentView: 'pricing',
    customerToken: localStorage.getItem('aai_cust_token') || null,
    customerUser: null,
    customerSub: null,
    adminToken: localStorage.getItem('aai_admin_token') || null,
    adminUser: null,
    plans: [],
    platformSettings: {},
    releases: []
};

// ==========================================
// NAVIGATION & VIEW SWITCHING
// ==========================================
function showView(viewId) {
    state.currentView = viewId;
    document.getElementById('viewPricing').classList.add('hidden');
    document.getElementById('viewCustomer').classList.add('hidden');
    document.getElementById('viewAdmin').classList.add('hidden');

    if (viewId === 'pricing') {
        document.getElementById('viewPricing').classList.remove('hidden');
        loadPublicPricing();
    } else if (viewId === 'customer') {
        document.getElementById('viewCustomer').classList.remove('hidden');
        initCustomerView();
    } else if (viewId === 'admin') {
        document.getElementById('viewAdmin').classList.remove('hidden');
        initAdminView();
    }
}

function scrollToPlans() {
    document.getElementById('pricingSection').scrollIntoView({ behavior: 'smooth' });
}

function showBanner(message, type = 'success') {
    const banner = document.getElementById('globalBanner');
    banner.className = `py-3 px-4 text-center text-sm font-medium ${
        type === 'error' ? 'bg-rose-500 text-white' : 'bg-emerald-600 text-white'
    }`;
    banner.textContent = message;
    banner.classList.remove('hidden');
    setTimeout(() => {
        banner.classList.add('hidden');
    }, 5000);
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
}

// ==========================================
// 1. PUBLIC PRICING & EMAIL PURCHASE FLOW
// ==========================================
async function loadPublicPricing() {
    try {
        const res = await fetch('/api/v1/pricing/public');
        const data = await res.json();
        if (!data.success) return;

        state.plans = data.plans;
        state.platformSettings = data.settings;

        // Render policies
        document.getElementById('policyTermsText').textContent = data.settings.subscriptionTerms;
        document.getElementById('policyRefundText').textContent = data.settings.refundPolicy;
        
        // Update contact links
        const waUrl = `https://wa.me/${(data.settings.developerWhatsApp || '').replace(/[^0-9]/g, '')}`;
        document.getElementById('navWhatsappBtn').href = waUrl;
        document.getElementById('heroSupportWa').href = waUrl;
        document.getElementById('heroSupportWa').innerHTML = `<i class="fa-brands fa-whatsapp mr-1 text-emerald-600"></i> WhatsApp: ${data.settings.developerWhatsApp}`;

        // Render Plans Grid
        const grid = document.getElementById('plansGrid');
        grid.innerHTML = data.plans.map((p, idx) => {
            const isPopular = p.durationMonths === 3;
            return `
                <div class="relative bg-white rounded-2xl border ${isPopular ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-lg' : 'border-slate-200 shadow-sm'} p-8 flex flex-col justify-between space-y-6">
                    ${isPopular ? `<span class="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-bold uppercase tracking-wider px-3.5 py-1 rounded-full shadow">Most Popular</span>` : ''}
                    
                    <div class="space-y-4">
                        <div class="space-y-1">
                            <h3 class="text-xl font-bold text-slate-900">${p.name}</h3>
                            <p class="text-xs text-slate-500">${p.description || ''}</p>
                        </div>
                        
                        <div class="space-y-1 pt-2">
                            <div class="flex items-baseline space-x-1">
                                <span class="text-3xl sm:text-4xl font-extrabold text-slate-900">₹${p.newCustomerPriceInr.toLocaleString('en-IN')}</span>
                                <span class="text-xs text-slate-500">/ ${p.durationLabel}</span>
                            </div>
                            <div class="text-xs text-emerald-700 font-medium">
                                Renewal Price: ₹${p.renewalPriceInr.toLocaleString('en-IN')} for continuing users
                            </div>
                        </div>

                        <ul class="space-y-2.5 text-xs text-slate-600 pt-4 border-t border-slate-100">
                            <li class="flex items-center"><i class="fa-solid fa-check text-emerald-500 mr-2"></i> All Exterior, Interior & Room Dimensions</li>
                            <li class="flex items-center"><i class="fa-solid fa-check text-emerald-500 mr-2"></i> Aligned Dimensions for Inclined Elements</li>
                            <li class="flex items-center"><i class="fa-solid fa-check text-emerald-500 mr-2"></i> Autodesk AI 2027 Style Copilot Panel</li>
                            <li class="flex items-center"><i class="fa-solid fa-check text-emerald-500 mr-2"></i> Dynamic Model Updater Auto-Sync</li>
                            <li class="flex items-center"><i class="fa-solid fa-check text-emerald-500 mr-2"></i> Revit 2024, 2025, 2026, 2027+ Support</li>
                            <li class="flex items-center"><i class="fa-solid fa-check text-emerald-500 mr-2"></i> Direct Developer WhatsApp Support</li>
                        </ul>
                    </div>

                    <button onclick="initiatePurchaseRequest('${p.id}', false)" class="w-full ${isPopular ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-slate-900 hover:bg-slate-800 text-white'} font-semibold py-3 rounded-xl text-sm shadow transition flex items-center justify-center">
                        <i class="fa-solid fa-envelope mr-2"></i> Request Purchase
                    </button>
                </div>
            `;
        }).join('');

    } catch (err) {
        console.error('Failed to load pricing:', err);
    }
}

// Phase 6: Initiate Email Purchase Request
async function initiatePurchaseRequest(planId, isRenewal = false) {
    let email = '';
    if (state.customerUser && state.customerUser.email) {
        email = state.customerUser.email;
    } else {
        email = prompt('Please enter your email address for the purchase request:') || '';
    }

    if (!email.trim()) return;

    try {
        const res = await fetch('/api/v1/pricing/request-purchase', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                planId,
                customerEmail: email.trim(),
                requestType: isRenewal ? 'RENEWAL' : 'NEW'
            })
        });

        const data = await res.json();

        if (!data.success) {
            if (data.code === 'DEVELOPER_EMAIL_NOT_CONFIGURED') {
                alert(data.error);
            } else {
                alert('Error: ' + data.error);
            }
            return;
        }

        // Populate Modal
        document.getElementById('modalReqPlanTitle').textContent = `${data.plan.name} (${data.plan.duration}) — ₹${data.plan.priceInr.toLocaleString('en-IN')}`;
        document.getElementById('modalReqBody').value = data.bodyText;
        document.getElementById('modalMailtoLink').href = data.mailtoUrl;
        document.getElementById('modalDevEmailDisplay').textContent = data.developerEmail;
        document.getElementById('copyBtnText').textContent = 'Copy Details';

        document.getElementById('modalPurchaseReq').classList.remove('hidden');

    } catch (err) {
        alert('Failed to generate purchase request: ' + err.message);
    }
}

function copyPurchaseRequest() {
    const text = document.getElementById('modalReqBody').value;
    navigator.clipboard.writeText(text).then(() => {
        document.getElementById('copyBtnText').textContent = 'Copied!';
        setTimeout(() => {
            document.getElementById('copyBtnText').textContent = 'Copy Details';
        }, 3000);
    });
}

// ==========================================
// 2. CUSTOMER PORTAL
// ==========================================
function switchCustAuthTab(tab) {
    if (tab === 'login') {
        document.getElementById('custLoginForm').classList.remove('hidden');
        document.getElementById('custRegisterForm').classList.add('hidden');
        document.getElementById('custTabLogin').className = 'flex-1 py-3 text-sm font-semibold text-blue-600 border-b-2 border-blue-600 text-center';
        document.getElementById('custTabRegister').className = 'flex-1 py-3 text-sm font-semibold text-slate-500 border-b-2 border-transparent text-center hover:text-slate-800';
    } else {
        document.getElementById('custLoginForm').classList.add('hidden');
        document.getElementById('custRegisterForm').classList.remove('hidden');
        document.getElementById('custTabRegister').className = 'flex-1 py-3 text-sm font-semibold text-blue-600 border-b-2 border-blue-600 text-center';
        document.getElementById('custTabLogin').className = 'flex-1 py-3 text-sm font-semibold text-slate-500 border-b-2 border-transparent text-center hover:text-slate-800';
    }
}

async function initCustomerView() {
    if (state.customerToken) {
        await loadCustomerProfile();
    } else {
        document.getElementById('customerAuthCard').classList.remove('hidden');
        document.getElementById('customerDashboard').classList.add('hidden');
    }
}

async function handleCustomerLogin(e) {
    e.preventDefault();
    const email = document.getElementById('custLoginEmail').value;
    const password = document.getElementById('custLoginPass').value;

    try {
        const res = await fetch('/api/v1/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (!data.success) {
            alert(data.error);
            return;
        }

        state.customerToken = data.token;
        state.customerUser = data.user;
        state.customerSub = data.subscription;
        localStorage.setItem('aai_cust_token', data.token);

        document.getElementById('customerAuthCard').classList.add('hidden');
        document.getElementById('customerDashboard').classList.remove('hidden');
        renderCustomerDashboard();
        loadCustomerReleases();
        loadCustomerRenewalPlans();

    } catch (err) {
        alert('Login failed: ' + err.message);
    }
}

async function handleCustomerRegister(e) {
    e.preventDefault();
    const fullName = document.getElementById('custRegName').value;
    const company = document.getElementById('custRegCompany').value;
    const email = document.getElementById('custRegEmail').value;
    const password = document.getElementById('custRegPass').value;

    try {
        const res = await fetch('/api/v1/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fullName, company, email, password })
        });
        const data = await res.json();

        if (!data.success) {
            alert(data.error);
            return;
        }

        state.customerToken = data.token;
        state.customerUser = data.user;
        localStorage.setItem('aai_cust_token', data.token);

        showBanner(data.message);
        document.getElementById('customerAuthCard').classList.add('hidden');
        document.getElementById('customerDashboard').classList.remove('hidden');
        renderCustomerDashboard();
        loadCustomerReleases();
        loadCustomerRenewalPlans();

    } catch (err) {
        alert('Registration failed: ' + err.message);
    }
}

async function loadCustomerProfile() {
    try {
        const res = await fetch('/api/v1/auth/me', {
            headers: { 'Authorization': `Bearer ${state.customerToken}` }
        });
        const data = await res.json();
        if (!data.success) {
            logoutCustomer();
            return;
        }

        state.customerUser = data.user;
        state.customerSub = data.subscription;

        document.getElementById('customerAuthCard').classList.add('hidden');
        document.getElementById('customerDashboard').classList.remove('hidden');
        renderCustomerDashboard();
        loadCustomerReleases();
        loadCustomerRenewalPlans();

    } catch (err) {
        logoutCustomer();
    }
}

function renderCustomerDashboard() {
    const user = state.customerUser;
    const sub = state.customerSub || {};

    document.getElementById('custDashName').textContent = user.full_name ? `Welcome, ${user.full_name}` : 'Welcome, Architect';
    document.getElementById('custDashEmail').textContent = user.email;
    document.getElementById('custDashId').textContent = `Account: ${user.id}`;

    // Approval status badge
    const badge = document.getElementById('custDashStatusBadge');
    const pendingNotice = document.getElementById('custPendingNotice');

    const status = sub.status || 'INACTIVE';
    document.getElementById('custStatStatus').textContent = status;
    document.getElementById('custStatPlan').textContent = sub.plan_code ? `Plan: ${sub.plan_code}` : 'No active plan';

    if (user.role === 'admin' || user.is_approved) {
        badge.className = status === 'ACTIVE' ? 'badge-active px-3 py-1 rounded-full text-xs font-bold uppercase' : 'badge-expired px-3 py-1 rounded-full text-xs font-bold uppercase';
        badge.textContent = status;
        pendingNotice.classList.add('hidden');
    } else {
        badge.className = 'badge-pending px-3 py-1 rounded-full text-xs font-bold uppercase';
        badge.textContent = 'PENDING APPROVAL';
        pendingNotice.classList.remove('hidden');
    }

    // Expiry date
    if (sub.expiry_date) {
        const exp = new Date(sub.expiry_date);
        document.getElementById('custStatExpiry').textContent = exp.toLocaleDateString();
        const diffDays = Math.ceil((exp - new Date()) / (1000 * 60 * 60 * 24));
        document.getElementById('custStatRemaining').textContent = diffDays > 0 ? `${diffDays} days remaining` : 'Expired';
    } else {
        document.getElementById('custStatExpiry').textContent = 'None';
        document.getElementById('custStatRemaining').textContent = 'Inactive';
    }

    // Reauth interval & next deadline
    document.getElementById('custStatInterval').textContent = `${sub.reauth_interval_days || 7} Days`;
    if (sub.next_reauth_deadline) {
        document.getElementById('custStatDeadline').textContent = new Date(sub.next_reauth_deadline).toLocaleDateString();
    } else {
        document.getElementById('custStatDeadline').textContent = 'Pending login';
    }
}

async function loadCustomerReleases() {
    try {
        const res = await fetch('/api/v1/releases/available');
        const data = await res.json();
        const list = document.getElementById('custReleasesList');

        if (!data.success || data.releases.length === 0) {
            list.innerHTML = `<div class="text-center py-4 text-slate-400 text-sm">No release packages currently uploaded.</div>`;
            return;
        }

        list.innerHTML = data.releases.map(r => `
            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl gap-3">
                <div class="space-y-1">
                    <div class="flex items-center space-x-2">
                        <span class="font-bold text-slate-900 text-base">AAI DIM v${r.versionNumber}</span>
                        <span class="text-xs bg-cyan-100 text-cyan-800 px-2 py-0.5 rounded-full font-medium">Revit ${r.minRevitVersion} - ${r.maxRevitVersion}</span>
                        ${r.isMandatory ? `<span class="text-xs bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full font-bold">Recommended</span>` : ''}
                    </div>
                    <p class="text-xs text-slate-600">${r.releaseNotes || 'Production-ready standalone installer package.'}</p>
                    <div class="text-[11px] text-slate-500 font-medium mt-1">📦 Setup Package: ${r.fileName} (${r.fileSizeFormatted}) • 🕒 Deployed: ${new Date(r.releaseDate).toLocaleString()}</div>
                </div>

                <a href="${r.downloadUrl}?token=${encodeURIComponent(state.customerToken)}" target="_blank" class="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-lg text-xs shadow transition flex items-center shrink-0">
                    <i class="fa-solid fa-download mr-1.5"></i> Download Setup (.zip)
                </a>
            </div>
        `).join('');

    } catch (err) {
        console.error('Failed to load customer releases:', err);
    }
}

async function loadCustomerRenewalPlans() {
    try {
        const res = await fetch('/api/v1/pricing/customer-plans', {
            headers: { 'Authorization': `Bearer ${state.customerToken}` }
        });
        const data = await res.json();
        const grid = document.getElementById('custPlansGrid');

        if (!data.success || !data.customerPlans) return;

        grid.innerHTML = data.customerPlans.map(p => `
            <div class="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4 flex flex-col justify-between">
                <div class="space-y-2">
                    <div class="flex items-center justify-between">
                        <span class="font-bold text-slate-900 text-base">${p.name}</span>
                        <span class="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-semibold">Renewal Rate</span>
                    </div>
                    <div class="text-2xl font-extrabold text-slate-900">₹${p.effectivePriceInr.toLocaleString('en-IN')} <span class="text-xs font-normal text-slate-500">/ ${p.durationLabel}</span></div>
                    <p class="text-xs text-slate-500">${p.description || ''}</p>
                </div>
                <button onclick="initiatePurchaseRequest('${p.id}', true)" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 rounded-lg text-xs shadow transition flex items-center justify-center">
                    <i class="fa-solid fa-arrows-rotate mr-1.5"></i> Request Renewal Email
                </button>
            </div>
        `).join('');

    } catch (err) {
        console.error('Failed to load customer renewal plans:', err);
    }
}

function logoutCustomer() {
    state.customerToken = null;
    state.customerUser = null;
    state.customerSub = null;
    localStorage.removeItem('aai_cust_token');
    showView('customer');
}

// ==========================================
// 3. ADMINISTRATOR PORTAL
// ==========================================
let adminSetupMode = false;

async function initAdminView() {
    if (state.adminToken) {
        document.getElementById('adminAuthCard').classList.add('hidden');
        document.getElementById('adminDashboard').classList.remove('hidden');
        refreshAdminData();
        return;
    }

    // Check if initial admin setup is required
    try {
        const res = await fetch('/api/v1/auth/setup-status');
        const data = await res.json();

        adminSetupMode = !data.adminExists;
        if (adminSetupMode) {
            document.getElementById('adminAuthTitle').textContent = 'Administrator Setup Wizard';
            document.getElementById('adminAuthSubtitle').textContent = 'Configure the initial platform administrator account';
            document.getElementById('adminSubmitBtn').textContent = 'Create Master Administrator';
            document.getElementById('adminSetupExtraFields').classList.remove('hidden');
        } else {
            document.getElementById('adminAuthTitle').textContent = 'Administrator Portal';
            document.getElementById('adminAuthSubtitle').textContent = 'Secure access for authorized platform operator';
            document.getElementById('adminSubmitBtn').textContent = 'Sign In as Administrator';
            document.getElementById('adminSetupExtraFields').classList.add('hidden');
        }

        document.getElementById('adminAuthCard').classList.remove('hidden');
        document.getElementById('adminDashboard').classList.add('hidden');

    } catch (err) {
        console.error(err);
    }
}

async function handleAdminLogin(e) {
    e.preventDefault();
    const email = document.getElementById('adminEmail').value;
    const password = document.getElementById('adminPass').value;

    const endpoint = adminSetupMode ? '/api/v1/auth/setup-admin' : '/api/v1/auth/login';
    const payload = adminSetupMode ? {
        email,
        password,
        fullName: document.getElementById('adminSetupName').value || 'System Administrator'
    } : { email, password };

    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (!data.success) {
            alert(data.error);
            return;
        }

        if (data.user.role !== 'admin') {
            alert('Access denied. Administrator privileges required.');
            return;
        }

        state.adminToken = data.token;
        state.adminUser = data.user;
        localStorage.setItem('aai_admin_token', data.token);

        document.getElementById('adminAuthCard').classList.add('hidden');
        document.getElementById('adminDashboard').classList.remove('hidden');
        document.getElementById('adminUserEmail').textContent = `Logged in as: ${data.user.email}`;

        refreshAdminData();

    } catch (err) {
        alert('Authentication failed: ' + err.message);
    }
}

function logoutAdmin() {
    state.adminToken = null;
    state.adminUser = null;
    localStorage.removeItem('aai_admin_token');
    initAdminView();
}

function switchAdminTab(tabName) {
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
        btn.classList.remove('border-blue-600', 'text-blue-600');
        btn.classList.add('border-transparent', 'text-slate-600');
    });
    document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.add('hidden'));

    if (tabName === 'customers') {
        document.getElementById('tabBtnCust').classList.add('border-blue-600', 'text-blue-600');
        document.getElementById('adminTabCustomers').classList.remove('hidden');
        loadAdminCustomers();
    } else if (tabName === 'pricing') {
        document.getElementById('tabBtnPrice').classList.add('border-blue-600', 'text-blue-600');
        document.getElementById('adminTabPricing').classList.remove('hidden');
        loadAdminPricing();
    } else if (tabName === 'releases') {
        document.getElementById('tabBtnRel').classList.add('border-blue-600', 'text-blue-600');
        document.getElementById('adminTabReleases').classList.remove('hidden');
        loadAdminReleases();
    } else if (tabName === 'settings') {
        document.getElementById('tabBtnSet').classList.add('border-blue-600', 'text-blue-600');
        document.getElementById('adminTabSettings').classList.remove('hidden');
        loadAdminSettings();
    } else if (tabName === 'audit') {
        document.getElementById('tabBtnAud').classList.add('border-blue-600', 'text-blue-600');
        document.getElementById('adminTabAudit').classList.remove('hidden');
        loadAdminAuditLogs();
    }
}

function refreshAdminData() {
    loadAdminCustomers();
    loadAdminPricing();
    loadAdminReleases();
    loadAdminSettings();
}

// ------------------------------------------
// ADMIN: CUSTOMERS & LICENSES
// ------------------------------------------
let searchTimer = null;
function debounceCustSearch() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadAdminCustomers, 300);
}

async function loadAdminCustomers() {
    const q = document.getElementById('adminCustSearch').value;
    const st = document.getElementById('adminCustFilterStatus').value;

    try {
        const res = await fetch(`/api/v1/admin/customers?query=${encodeURIComponent(q)}&status=${encodeURIComponent(st)}`, {
            headers: { 'Authorization': `Bearer ${state.adminToken}` }
        });
        const data = await res.json();
        const tbody = document.getElementById('adminCustomersTableBody');

        if (!data.success || data.customers.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-8 text-center text-slate-400">No matching customer accounts found.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.customers.map(c => {
            const sub = c.subscription || {};
            const status = sub.status || 'INACTIVE';
            let badgeClass = 'badge-pending';
            if (status === 'ACTIVE') badgeClass = 'badge-active';
            if (status === 'EXPIRED') badgeClass = 'badge-expired';
            if (status === 'SUSPENDED') badgeClass = 'badge-suspended';

            const expDate = sub.expiryDate ? new Date(sub.expiryDate).toLocaleDateString() : 'None';
            const startDate = sub.startDate ? new Date(sub.startDate).toLocaleDateString() : '--';
            const nextReauth = sub.nextReauthDeadline ? new Date(sub.nextReauthDeadline).toLocaleDateString() : '--';
            const lastAuth = sub.lastAuthDate ? new Date(sub.lastAuthDate).toLocaleDateString() : 'Never';

            return `
                <tr class="hover:bg-slate-50 transition">
                    <td class="px-6 py-4">
                        <div class="font-bold text-slate-900">${c.email}</div>
                        <div class="text-xs text-slate-500">${c.fullName || ''} ${c.company ? '• ' + c.company : ''}</div>
                        <div class="text-[11px] text-slate-400 font-mono">${c.id}</div>
                    </td>
                    <td class="px-6 py-4">
                        <span class="${badgeClass} px-2.5 py-0.5 rounded-full text-xs font-bold uppercase">${status}</span>
                        <div class="text-xs mt-1 text-slate-500">${c.isApproved ? '✅ Approved' : '⏳ Pending Approval'}</div>
                    </td>
                    <td class="px-6 py-4">
                        <div class="text-xs font-medium text-slate-800">${startDate} → ${expDate}</div>
                        <div class="text-[11px] text-slate-400">Plan: ${sub.planCode || 'None'}</div>
                    </td>
                    <td class="px-6 py-4 font-semibold text-slate-800">
                        ${sub.reauthIntervalDays || 7} Days
                    </td>
                    <td class="px-6 py-4 text-xs text-slate-600">
                        <div>Last Auth: ${lastAuth}</div>
                        <div class="text-slate-400">Next Reauth: ${nextReauth}</div>
                    </td>
                    <td class="px-6 py-4 text-right space-x-1">
                        <button onclick="toggleApproveCustomer('${c.id}', ${!c.isApproved})" class="px-2.5 py-1 text-xs border border-slate-300 rounded hover:bg-slate-100 font-medium text-slate-700">
                            ${c.isApproved ? 'Unapprove' : 'Approve'}
                        </button>
                        <button onclick="openResetPasswordModal('${c.id}', '${c.email}')" class="px-2.5 py-1 text-xs border border-amber-300 text-amber-700 hover:bg-amber-50 rounded font-medium">
                            Set Password
                        </button>
                        <button onclick="openManageLicenseModal('${c.id}', '${c.email}', ${sub.reauthIntervalDays || 7})" class="px-2.5 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded font-medium shadow-sm">
                            Manage License
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (err) {
        console.error('Failed to load customers:', err);
    }
}

async function toggleApproveCustomer(id, approve) {
    try {
        const res = await fetch(`/api/v1/admin/customers/${id}/approve`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${state.adminToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ approve })
        });
        const data = await res.json();
        showBanner(data.message);
        loadAdminCustomers();
    } catch (err) {
        alert(err.message);
    }
}

function openAddCustomerModal() {
    document.getElementById('modalAddCustomer').classList.remove('hidden');
}

async function executeAddCustomer(e) {
    e.preventDefault();
    const email = document.getElementById('newCustEmail').value;
    const fullName = document.getElementById('newCustName').value;
    const company = document.getElementById('newCustCompany').value;
    const initialPassword = document.getElementById('newCustPassword') ? document.getElementById('newCustPassword').value : 'Password123!';
    const autoApprove = document.getElementById('newCustApprove').checked;

    try {
        const res = await fetch('/api/v1/admin/customers/create', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${state.adminToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, fullName, company, initialPassword, autoApprove })
        });
        const data = await res.json();
        if (!data.success) {
            alert(data.error);
            return;
        }

        closeModal('modalAddCustomer');
        showBanner(`Customer ${email} created with password: ${initialPassword}`);
        loadAdminCustomers();
    } catch (err) {
        alert(err.message);
    }
}

function openResetPasswordModal(userId, email) {
    document.getElementById('resetPassUserId').value = userId;
    document.getElementById('resetPassEmail').textContent = email;
    document.getElementById('resetPassValue').value = 'Password123!';
    document.getElementById('modalResetPassword').classList.remove('hidden');
}

async function executeResetCustomerPassword(e) {
    e.preventDefault();
    const userId = document.getElementById('resetPassUserId').value;
    const newPassword = document.getElementById('resetPassValue').value;
    const email = document.getElementById('resetPassEmail').textContent;

    try {
        const res = await fetch(`/api/v1/admin/customers/${userId}/reset-password`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${state.adminToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ newPassword })
        });
        const data = await res.json();
        if (!data.success) {
            alert(data.error);
            return;
        }
        closeModal('modalResetPassword');
        showBanner(`Password updated successfully for ${email}`);
    } catch (err) {
        alert(err.message);
    }
}

function openManageLicenseModal(userId, email, currentInterval) {
    document.getElementById('modLicUserId').value = userId;
    document.getElementById('modLicEmail').textContent = email;
    document.getElementById('modLicInterval').value = currentInterval;
    document.getElementById('modalAdminLicense').classList.remove('hidden');
}

async function executeLicenseActivation() {
    const userId = document.getElementById('modLicUserId').value;
    const planCode = document.getElementById('modLicPlan').value;
    const durationMonths = document.getElementById('modLicDuration').value;
    const paymentRef = document.getElementById('modLicPaymentRef').value;
    const interval = document.getElementById('modLicInterval').value;

    try {
        const res = await fetch(`/api/v1/admin/customers/${userId}/subscription/activate`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${state.adminToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                planCode,
                durationMonths,
                reauthIntervalDays: interval,
                paymentRef,
                notes: 'Manual payment confirmed by admin.'
            })
        });
        const data = await res.json();
        if (!data.success) {
            alert(data.error);
            return;
        }

        closeModal('modalAdminLicense');
        showBanner(data.message);
        loadAdminCustomers();
    } catch (err) {
        alert(err.message);
    }
}

async function executeReauthIntervalUpdate() {
    const userId = document.getElementById('modLicUserId').value;
    const intervalDays = document.getElementById('modLicInterval').value;

    try {
        const res = await fetch(`/api/v1/admin/customers/${userId}/reauth-interval`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${state.adminToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ intervalDays })
        });
        const data = await res.json();
        if (!data.success) {
            alert(data.error);
            return;
        }

        showBanner(data.message);
        loadAdminCustomers();
    } catch (err) {
        alert(err.message);
    }
}

async function executeStatusChange(status) {
    const userId = document.getElementById('modLicUserId').value;

    if (!confirm(`Are you sure you want to set license status to ${status}?`)) return;

    try {
        const res = await fetch(`/api/v1/admin/customers/${userId}/subscription/status`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${state.adminToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status })
        });
        const data = await res.json();
        if (!data.success) {
            alert(data.error);
            return;
        }

        closeModal('modalAdminLicense');
        showBanner(data.message);
        loadAdminCustomers();
    } catch (err) {
        alert(err.message);
    }
}

// ------------------------------------------
// ADMIN: PRICING CONTROLS
// ------------------------------------------
async function loadAdminPricing() {
    try {
        const res = await fetch('/api/v1/admin/pricing', {
            headers: { 'Authorization': `Bearer ${state.adminToken}` }
        });
        const data = await res.json();
        const container = document.getElementById('adminPricingList');

        if (!data.success) return;

        container.innerHTML = data.plans.map(p => `
            <div class="border border-slate-200 rounded-xl p-5 bg-slate-50 space-y-4">
                <div class="flex items-center justify-between">
                    <div>
                        <h4 class="font-bold text-slate-900 text-base">${p.name}</h4>
                        <span class="text-xs text-slate-500">${p.duration_months} Calendar Month(s)</span>
                    </div>
                    <label class="flex items-center space-x-2 text-xs font-semibold text-slate-700">
                        <input type="checkbox" id="planActive_${p.id}" ${p.is_enabled ? 'checked' : ''} class="rounded border-slate-300 text-blue-600">
                        <span>Enabled</span>
                    </label>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">New Customer Price (INR ₹)</label>
                        <input type="number" step="0.01" id="planNewPrice_${p.id}" value="${p.new_customer_price_inr}" class="w-full px-3 py-2 border border-slate-300 rounded text-sm bg-white">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Renewal Price (INR ₹)</label>
                        <input type="number" step="0.01" id="planRenewPrice_${p.id}" value="${p.renewal_price_inr}" class="w-full px-3 py-2 border border-slate-300 rounded text-sm bg-white">
                    </div>
                </div>

                <div>
                    <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Plan Description</label>
                    <input type="text" id="planDesc_${p.id}" value="${p.description || ''}" class="w-full px-3 py-2 border border-slate-300 rounded text-xs bg-white">
                </div>

                <div class="flex justify-end">
                    <button onclick="saveAdminPlan('${p.id}')" class="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-1.5 rounded text-xs shadow transition">
                        Save Plan Changes
                    </button>
                </div>
            </div>
        `).join('');

    } catch (err) {
        console.error('Failed to load pricing:', err);
    }
}

async function saveAdminPlan(planId) {
    const newPrice = document.getElementById(`planNewPrice_${planId}`).value;
    const renewPrice = document.getElementById(`planRenewPrice_${planId}`).value;
    const desc = document.getElementById(`planDesc_${planId}`).value;
    const isEnabled = document.getElementById(`planActive_${planId}`).checked;

    try {
        const res = await fetch(`/api/v1/admin/pricing/${planId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${state.adminToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                newCustomerPriceInr: newPrice,
                renewalPriceInr: renewPrice,
                description: desc,
                isEnabled
            })
        });
        const data = await res.json();
        showBanner(data.message);
        loadAdminPricing();
    } catch (err) {
        alert(err.message);
    }
}

// ------------------------------------------
// ADMIN: RELEASES & VERSION MANAGEMENT
// ------------------------------------------
async function loadAdminReleases() {
    try {
        const res = await fetch('/api/v1/admin/releases', {
            headers: { 'Authorization': `Bearer ${state.adminToken}` }
        });
        const data = await res.json();
        const list = document.getElementById('adminReleasesList');

        if (!data.success || data.releases.length === 0) {
            list.innerHTML = `<div class="text-center py-6 text-slate-400 text-sm">No versions uploaded yet. Click 'Upload New Version' above.</div>`;
            return;
        }

        list.innerHTML = data.releases.map(r => `
            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl gap-3">
                <div class="space-y-1">
                    <div class="flex items-center space-x-2">
                        <span class="font-bold text-slate-900 text-base">Version ${r.version_number}</span>
                        <span class="text-xs bg-cyan-100 text-cyan-800 px-2 py-0.5 rounded-full">Revit ${r.min_revit_version} - ${r.max_revit_version}</span>
                        <span class="${r.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'} text-xs px-2 py-0.5 rounded-full font-bold">
                            ${r.is_active ? 'Active' : 'Inactive'}
                        </span>
                    </div>
                    <div class="text-xs text-slate-600">${r.release_notes || 'No notes provided.'}</div>
                    <div class="text-[11px] text-slate-500 font-medium mt-1">📦 Package: ${r.file_name} • ${(r.file_size_bytes / 1024).toFixed(1)} KB • 🕒 Deployed: ${new Date(r.created_at || r.release_date).toLocaleString()}</div>
                </div>

                <div class="flex items-center space-x-2">
                    <button onclick="toggleReleaseActive('${r.id}')" class="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold text-slate-700 hover:bg-slate-100">
                        ${r.is_active ? 'Disable' : 'Enable'}
                    </button>
                    <a href="/api/v1/releases/download/${r.version_number}?token=${encodeURIComponent(state.adminToken)}" class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-xs font-semibold shadow">
                        Download
                    </a>
                </div>
            </div>
        `).join('');

    } catch (err) {
        console.error('Failed to load releases:', err);
    }
}

function openUploadReleaseModal() {
    document.getElementById('modalUploadRelease').classList.remove('hidden');
}

async function executeUploadRelease(e) {
    e.preventDefault();
    const ver = document.getElementById('relVerNum').value;
    const minRev = document.getElementById('relMinRevit').value;
    const maxRev = document.getElementById('relMaxRevit').value;
    const notes = document.getElementById('relNotes').value;
    const fileInput = document.getElementById('relPackageFile');

    if (!fileInput.files || fileInput.files.length === 0) {
        alert('Please choose a .zip file.');
        return;
    }

    const formData = new FormData();
    formData.append('versionNumber', ver);
    formData.append('minRevitVersion', minRev);
    formData.append('maxRevitVersion', maxRev);
    formData.append('releaseNotes', notes);
    formData.append('packageZip', fileInput.files[0]);

    try {
        const res = await fetch('/api/v1/admin/releases/upload', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${state.adminToken}` },
            body: formData
        });
        const data = await res.json();

        if (!data.success) {
            alert(data.error);
            return;
        }

        closeModal('modalUploadRelease');
        showBanner(data.message);
        loadAdminReleases();

    } catch (err) {
        alert('Upload failed: ' + err.message);
    }
}

async function toggleReleaseActive(id) {
    try {
        const res = await fetch(`/api/v1/admin/releases/${id}/toggle`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${state.adminToken}` }
        });
        const data = await res.json();
        showBanner(data.message);
        loadAdminReleases();
    } catch (err) {
        alert(err.message);
    }
}

// ------------------------------------------
// ADMIN: SETTINGS
// ------------------------------------------
async function loadAdminSettings() {
    try {
        const res = await fetch('/api/v1/admin/settings', {
            headers: { 'Authorization': `Bearer ${state.adminToken}` }
        });
        const data = await res.json();
        if (!data.success) return;

        const s = data.settings;
        document.getElementById('setDevName').value = s.developer_name || 'Aadesh Navade';
        document.getElementById('setDevEmail').value = s.developer_email || '';
        document.getElementById('setDevWa').value = s.developer_whatsapp || '+91 9341102949';
        document.getElementById('setDefaultReauth').value = s.default_reauth_days || '7';
        document.getElementById('setOfflineGrace').value = s.offline_grace_hours || '72';
        document.getElementById('setProdName').value = s.product_name || 'AAI DIM';
        document.getElementById('setTerms').value = s.subscription_terms || '';
        document.getElementById('setRefund').value = s.refund_policy || '';

    } catch (err) {
        console.error('Failed to load settings:', err);
    }
}

async function saveAdminSettings(e) {
    e.preventDefault();
    const settings = {
        developer_name: document.getElementById('setDevName').value,
        developer_email: document.getElementById('setDevEmail').value,
        developer_whatsapp: document.getElementById('setDevWa').value,
        default_reauth_days: document.getElementById('setDefaultReauth').value,
        offline_grace_hours: document.getElementById('setOfflineGrace').value,
        product_name: document.getElementById('setProdName').value,
        subscription_terms: document.getElementById('setTerms').value,
        refund_policy: document.getElementById('setRefund').value
    };

    try {
        const res = await fetch('/api/v1/admin/settings', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${state.adminToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ settings })
        });
        const data = await res.json();
        showBanner(data.message);
        loadAdminSettings();
    } catch (err) {
        alert(err.message);
    }
}

// ------------------------------------------
// ADMIN: AUDIT LOGS
// ------------------------------------------
async function loadAdminAuditLogs() {
    try {
        const res = await fetch('/api/v1/admin/audit-logs', {
            headers: { 'Authorization': `Bearer ${state.adminToken}` }
        });
        const data = await res.json();
        const tbody = document.getElementById('adminAuditTableBody');

        if (!data.success || data.logs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-6 text-center text-slate-400">No audit records found.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.logs.map(l => `
            <tr class="hover:bg-slate-50">
                <td class="px-4 py-2.5 font-mono text-[11px] text-slate-500">${new Date(l.timestamp).toLocaleString()}</td>
                <td class="px-4 py-2.5 font-semibold text-slate-800">${l.actorEmail || 'System'}</td>
                <td class="px-4 py-2.5"><span class="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono text-[10px]">${l.action}</span></td>
                <td class="px-4 py-2.5 text-slate-700">${l.targetEmail || '--'}</td>
                <td class="px-4 py-2.5 font-mono text-[11px] text-slate-500 truncate max-w-xs" title='${JSON.stringify(l.details)}'>${JSON.stringify(l.details)}</td>
            </tr>
        `).join('');

    } catch (err) {
        console.error('Failed to load audit logs:', err);
    }
}

// ==========================================
// AADISKETCH 3D WEB STUDIO CONTROLLER
// ==========================================
let aadisketchModel = null;
let aadisketchViewport = null;
let aadisketchToolManager = null;

function initAadiSketchWeb() {
    const container = document.getElementById('aadisketchWebContainer');
    if (!container || aadisketchViewport || !window.AadiSketchWeb || !window.THREE) return;

    try {
        aadisketchModel = new AadiSketchWeb.SketchUpModel('Web Building Project');
        aadisketchModel.loadSampleBuilding();

        const statusEl = document.getElementById('aadisketchStatusPrompt');
        const measureLabelEl = document.getElementById('aadisketchMeasureLabel');
        const measureValEl = document.getElementById('aadisketchMeasureVal');
        const viewCubeBox = document.getElementById('aadisketchViewCubeBox');

        const onStatus = (msg) => {
            if (statusEl) statusEl.textContent = msg;
        };

        const onMeasure = (label, val) => {
            if (measureLabelEl) measureLabelEl.textContent = label ? label + ':' : 'Measurements:';
            if (measureValEl) measureValEl.value = val;
        };

        const onViewAngleChange = (degX, degY) => {
            if (viewCubeBox) {
                viewCubeBox.style.transform = `rotateX(${-degX}deg) rotateZ(${degY}deg)`;
            }
        };

        const onSelect = (type, entity) => {
            const infoType = document.getElementById('traySelectedType');
            const infoArea = document.getElementById('traySelectedArea');
            const infoNormal = document.getElementById('traySelectedNormal');
            if (!type || !entity) {
                if (infoType) infoType.textContent = 'None';
                if (infoArea) infoArea.textContent = '—';
                if (infoNormal) infoNormal.textContent = '—';
                return;
            }
            if (infoType) infoType.textContent = type === 'face' ? 'Face (Surface)' : 'Edge';
            if (infoArea) infoArea.textContent = entity.area ? `${entity.area} sq m` : '—';
            if (infoNormal && entity.normal) {
                infoNormal.textContent = `(${entity.normal.x.toFixed(2)}, ${entity.normal.y.toFixed(2)}, ${entity.normal.z.toFixed(2)})`;
            }
        };

        aadisketchViewport = new AadiSketchWeb.SketchUpViewport(container, onSelect, (action, e, hit) => {
            if (aadisketchToolManager) aadisketchToolManager.handleAction(action, e, hit);
        }, onViewAngleChange);

        aadisketchViewport.setModel(aadisketchModel);
        aadisketchToolManager = new AadiSketchWeb.ToolManager(aadisketchModel, aadisketchViewport, onStatus, onMeasure);

        // ViewCube click handlers
        const cubeFaces = document.querySelectorAll('#aadisketchViewCubeBox .cube-face');
        cubeFaces.forEach(f => {
            f.addEventListener('click', (e) => {
                e.stopPropagation();
                const v = f.getAttribute('data-view');
                if (v && aadisketchViewport) aadisketchViewport.setStandardView(v);
            });
        });

        const cubeHome = document.getElementById('aadisketchCubeHome');
        if (cubeHome) {
            cubeHome.addEventListener('click', (e) => {
                e.stopPropagation();
                if (aadisketchViewport) aadisketchViewport.setStandardView('iso');
            });
        }

        window.addEventListener('resize', () => {
            if (aadisketchViewport) aadisketchViewport.onResize();
        });

        if (measureValEl) {
            measureValEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    aadisketchToolManager.applyTypedInput(measureValEl.value);
                }
            });
        }

        // Global keyboard tool shortcuts
        window.addEventListener('keydown', (e) => {
            if (['input', 'textarea'].includes(document.activeElement?.tagName?.toLowerCase())) return;
            const k = e.key.toLowerCase();
            if (k === ' ') { e.preventDefault(); setWebCADTool('select'); }
            else if (k === 'p') setWebCADTool('pushpull');
            else if (k === 'l') setWebCADTool('line');
            else if (k === 'r') setWebCADTool('rectangle');
            else if (k === 'c') setWebCADTool('circle');
            else if (k === 'e') setWebCADTool('eraser');
            else if (k === 'b') setWebCADTool('paint');
            else if (e.ctrlKey && k === 'z') { e.preventDefault(); undoWebCAD(); }
            else if (e.ctrlKey && k === 'y') { e.preventDefault(); redoWebCAD(); }
        });

        window.aadisketchViewport = aadisketchViewport;
        window.aadisketchToolManager = aadisketchToolManager;
        window.aadisketchModel = aadisketchModel;
        console.log('[AadiSketch] Web Modeler Studio successfully initialized.');
    } catch (err) {
        console.error('[AadiSketch] Init failed:', err);
    }
}

function setWebCADTool(toolName) {
    if (!aadisketchToolManager) return;
    aadisketchToolManager.setTool(toolName);
    const toolBtns = document.querySelectorAll('.web-cad-tool-btn');
    toolBtns.forEach(btn => {
        if (btn.getAttribute('data-tool') === toolName) {
            btn.className = 'web-cad-tool-btn bg-blue-600 text-white shadow-md px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center';
        } else {
            btn.className = 'web-cad-tool-btn bg-white text-slate-700 hover:bg-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center border border-slate-300';
        }
    });
}

function setWebStandardView(view) {
    if (aadisketchViewport) aadisketchViewport.setStandardView(view);
}

function setWebCADMaterial(color, name) {
    if (!aadisketchToolManager) return;
    aadisketchToolManager.activeMaterial = { color, name };
    const nameEl = document.getElementById('trayActiveMatName');
    if (nameEl) nameEl.textContent = name;
    aadisketchToolManager.onStatus(`Active Paint Material: ${name}`);
}

function addWebCADComponent(type) {
    if (!aadisketchModel || !aadisketchViewport) return;
    if (type === 'door') {
        const d = aadisketchModel.createRectangle(new AadiSketchWeb.Point3D(5, -0.05, 0), new AadiSketchWeb.Point3D(6.1, 0.05, 0), 0, { color: '#92400e', name: 'Wood Door' });
        aadisketchModel.pushPullFace(d.id, 2.1);
    } else if (type === 'window') {
        const w = aadisketchModel.createRectangle(new AadiSketchWeb.Point3D(9.5, -0.05, 0.9), new AadiSketchWeb.Point3D(11.5, 0.05, 0.9), 0.9, { color: '#38bdf8', name: 'Glazing' });
        aadisketchModel.pushPullFace(w.id, 1.3);
    } else if (type === 'column') {
        const c = aadisketchModel.createRectangle(new AadiSketchWeb.Point3D(4, 4, 0), new AadiSketchWeb.Point3D(4.5, 4.5, 0), 0, { color: '#94a3b8', name: 'R.C.C Column' });
        aadisketchModel.pushPullFace(c.id, 3.2);
    } else if (type === 'bed') {
        const b = aadisketchModel.createRectangle(new AadiSketchWeb.Point3D(10, 2, 0), new AadiSketchWeb.Point3D(13, 4, 0), 0, { color: '#3b82f6', name: 'King Bed' });
        aadisketchModel.pushPullFace(b.id, 0.6);
    }
    aadisketchViewport.rebuildScene();
    if (aadisketchToolManager) aadisketchToolManager.onStatus(`Added 3D ${type} component.`);
}

function resetWebCADSample() {
    if (!aadisketchModel || !aadisketchViewport) return;
    aadisketchModel.loadSampleBuilding();
    aadisketchViewport.rebuildScene();
    aadisketchViewport.setStandardView('iso');
    if (aadisketchToolManager) aadisketchToolManager.onStatus('Loaded complete 3D architectural sample house.');
}

function clearWebCADModel() {
    if (!aadisketchModel || !aadisketchViewport) return;
    aadisketchModel.faces = [];
    aadisketchModel.edges = [];
    aadisketchViewport.rebuildScene();
    if (aadisketchToolManager) aadisketchToolManager.onStatus('Canvas cleared. Click Rectangle or Line to start drafting.');
}

function undoWebCAD() {
    if (!aadisketchModel || !aadisketchViewport) return;
    if (aadisketchModel.undo()) {
        aadisketchViewport.rebuildScene();
        if (aadisketchToolManager) aadisketchToolManager.onStatus('Undo action completed.');
    }
}

function redoWebCAD() {
    if (!aadisketchModel || !aadisketchViewport) return;
    if (aadisketchModel.redo()) {
        aadisketchViewport.rebuildScene();
        if (aadisketchToolManager) aadisketchToolManager.onStatus('Redo action completed.');
    }
}

function switchToAadiSketchTab() {
    showView('pricing');
    switchShowcaseTab('aadisketch');
    setTimeout(() => {
        const el = document.getElementById('aadisketchStudioSection');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
        if (aadisketchViewport) aadisketchViewport.onResize();
    }, 120);
}

// ==========================================
// BIM SHOWCASE TABS CONTROLLER
// ==========================================
function switchShowcaseTab(tabKey) {
    const tabs = ['aadisketch', 'sheet', 'digitaltwin', 'copilot'];
    tabs.forEach(t => {
        const content = document.getElementById(`showcaseTab${t.charAt(0).toUpperCase() + t.slice(1)}`);
        if (content) content.classList.add('hidden');
    });

    const activeMap = {
        aadisketch: { id: 'showcaseTabAadisketch', btn: 'showcaseTab1Btn' },
        sheet: { id: 'showcaseTabSheet', btn: 'showcaseTab2Btn' },
        digitaltwin: { id: 'showcaseTabDigitalTwin', btn: 'showcaseTab3Btn' },
        copilot: { id: 'showcaseTabCopilot', btn: 'showcaseTab4Btn' }
    };

    const target = activeMap[tabKey] || activeMap.aadisketch;
    const targetContent = document.getElementById(target.id);
    if (targetContent) targetContent.classList.remove('hidden');

    // Update buttons styling
    [1, 2, 3, 4].forEach(num => {
        const b = document.getElementById(`showcaseTab${num}Btn`);
        if (b) {
            b.className = 'tab-btn px-4 sm:px-6 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition text-slate-700 hover:text-slate-900 hover:bg-white/80 flex items-center space-x-2';
        }
    });

    const activeBtn = document.getElementById(target.btn);
    if (activeBtn) {
        activeBtn.className = 'tab-btn px-4 sm:px-6 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition shadow-sm bg-blue-600 text-white flex items-center space-x-2';
    }

    if (tabKey === 'aadisketch') {
        if (!aadisketchViewport) {
            initAadiSketchWeb();
        } else {
            setTimeout(() => aadisketchViewport.onResize(), 50);
        }
    }
}

// ==========================================
// DYNAMIC CONTINUOUS BIM BACKGROUND ANIMATION
// ==========================================
class BimCanvasAnimation {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;

        this.nodes = [];
        this.dimensions = [];
        this.icons = [];
        this.animId = null;

        this.initEntities();
        this.bindEvents();
        this.animate();
    }

    initEntities() {
        // 1. Digital Twin Wireframe Nodes
        this.nodes = [];
        const nodeCount = Math.min(Math.floor(this.width / 40), 45);
        for (let i = 0; i < nodeCount; i++) {
            this.nodes.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                vx: (Math.random() - 0.5) * 0.65,
                vy: (Math.random() - 0.5) * 0.65,
                radius: Math.random() * 2.5 + 1.5,
                color: Math.random() > 0.5 ? 'rgba(6, 182, 212, 0.45)' : 'rgba(59, 130, 246, 0.45)'
            });
        }

        // 2. Continuous Drifting Dimension Callouts
        const sampleDims = [
            '12\'-6"', '3,600 mm', '4,800 mm', '2,400 mm', '200 mm Wall',
            'R = 5,200 mm', '90.0°', 'L01 +0.00', 'L02 +3.60m', 'GRID A-B 6000',
            'A101', 'LOD 400', '34.5° ALIGNED', '7,200 mm', '150 mm PARTITION', 'D01 900x2100'
        ];
        this.dimensions = [];
        for (let i = 0; i < 16; i++) {
            this.dimensions.push({
                text: sampleDims[i % sampleDims.length],
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                vx: (Math.random() - 0.5) * 0.45,
                vy: (Math.random() - 0.5) * 0.45,
                angle: (Math.random() - 0.5) * 0.35,
                length: Math.random() * 60 + 65,
                alpha: Math.random() * 0.22 + 0.12
            });
        }

        // 3. Floating BIM Graphic Icons (Grid heads, Level Datum tags, Calipers, Section tags)
        const iconTypes = ['GRID_A', 'GRID_1', 'LEVEL_TAG', 'SECTION_TAG', 'CROSSHAIR', 'CAD_CUBE'];
        this.icons = [];
        for (let i = 0; i < 14; i++) {
            this.icons.push({
                type: iconTypes[i % iconTypes.length],
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                vx: (Math.random() - 0.5) * 0.4,
                vy: (Math.random() - 0.5) * 0.4,
                rot: Math.random() * Math.PI * 2,
                vRot: (Math.random() - 0.5) * 0.008,
                scale: Math.random() * 0.25 + 0.85,
                alpha: Math.random() * 0.25 + 0.15
            });
        }
    }

    animate() {
        this.animId = requestAnimationFrame(() => this.animate());
        this.ctx.clearRect(0, 0, this.width, this.height);

        // Update and draw digital twin mesh
        for (let i = 0; i < this.nodes.length; i++) {
            const p1 = this.nodes[i];
            p1.x += p1.vx;
            p1.y += p1.vy;
            if (p1.x < 0) p1.x = this.width;
            if (p1.x > this.width) p1.x = 0;
            if (p1.y < 0) p1.y = this.height;
            if (p1.y > this.height) p1.y = 0;

            // Draw node
            this.ctx.beginPath();
            this.ctx.arc(p1.x, p1.y, p1.radius, 0, Math.PI * 2);
            this.ctx.fillStyle = p1.color;
            this.ctx.fill();

            for (let j = i + 1; j < this.nodes.length; j++) {
                const p2 = this.nodes[j];
                const dx = p1.x - p2.x;
                const dy = p1.y - p2.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 130) {
                    const lineAlpha = (1 - dist / 130) * 0.22;
                    this.ctx.beginPath();
                    this.ctx.moveTo(p1.x, p1.y);
                    this.ctx.lineTo(p2.x, p2.y);
                    this.ctx.strokeStyle = `rgba(14, 165, 233, ${lineAlpha})`;
                    this.ctx.lineWidth = 0.9;
                    this.ctx.stroke();
                }
            }
        }

        // Update and draw floating architectural dimension callouts
        this.dimensions.forEach(dim => {
            dim.x += dim.vx;
            dim.y += dim.vy;
            if (dim.x < -100) dim.x = this.width + 60;
            if (dim.x > this.width + 100) dim.x = -60;
            if (dim.y < -50) dim.y = this.height + 40;
            if (dim.y > this.height + 50) dim.y = -40;

            this.ctx.save();
            this.ctx.translate(dim.x, dim.y);
            this.ctx.rotate(dim.angle);

            const half = dim.length / 2;
            this.ctx.strokeStyle = `rgba(59, 130, 246, ${dim.alpha})`;
            this.ctx.fillStyle = `rgba(30, 64, 175, ${dim.alpha * 1.4})`;
            this.ctx.lineWidth = 1;

            // Dimension line
            this.ctx.beginPath();
            this.ctx.moveTo(-half, 0);
            this.ctx.lineTo(half, 0);
            this.ctx.stroke();

            // Architectural ticks (45-degree slashes)
            this.ctx.beginPath();
            this.ctx.moveTo(-half - 4, 4);
            this.ctx.lineTo(-half + 4, -4);
            this.ctx.moveTo(half - 4, 4);
            this.ctx.lineTo(half + 4, -4);
            this.ctx.stroke();

            // Dimension witness lines
            this.ctx.beginPath();
            this.ctx.moveTo(-half, -8);
            this.ctx.lineTo(-half, 8);
            this.ctx.moveTo(half, -8);
            this.ctx.lineTo(half, 8);
            this.ctx.stroke();

            // Text
            this.ctx.font = '10px monospace';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'bottom';
            this.ctx.fillText(dim.text, 0, -3);

            this.ctx.restore();
        });

        // Update and draw floating BIM icons
        this.icons.forEach(ic => {
            ic.x += ic.vx;
            ic.y += ic.vy;
            ic.rot += ic.vRot;
            if (ic.x < -60) ic.x = this.width + 50;
            if (ic.x > this.width + 60) ic.x = -50;
            if (ic.y < -60) ic.y = this.height + 50;
            if (ic.y > this.height + 60) ic.y = -50;

            this.ctx.save();
            this.ctx.translate(ic.x, ic.y);
            this.ctx.rotate(ic.rot);
            this.ctx.scale(ic.scale, ic.scale);

            if (ic.type === 'GRID_A' || ic.type === 'GRID_1') {
                // Revit Grid Head Circle
                this.ctx.beginPath();
                this.ctx.arc(0, 0, 14, 0, Math.PI * 2);
                this.ctx.strokeStyle = `rgba(2, 132, 199, ${ic.alpha * 1.4})`;
                this.ctx.fillStyle = `rgba(240, 249, 255, ${ic.alpha * 0.6})`;
                this.ctx.lineWidth = 1.4;
                this.ctx.fill();
                this.ctx.stroke();

                this.ctx.font = 'bold 10px sans-serif';
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                this.ctx.fillStyle = `rgba(3, 105, 161, ${ic.alpha * 1.6})`;
                this.ctx.fillText(ic.type === 'GRID_A' ? 'A' : '1', 0, 0);

                // Grid tail line
                this.ctx.beginPath();
                this.ctx.moveTo(0, 14);
                this.ctx.lineTo(0, 34);
                this.ctx.setLineDash([4, 3]);
                this.ctx.stroke();
                this.ctx.setLineDash([]);
            } else if (ic.type === 'LEVEL_TAG') {
                // Revit Level Datum Tag
                this.ctx.beginPath();
                this.ctx.moveTo(0, -10);
                this.ctx.lineTo(-8, 4);
                this.ctx.lineTo(8, 4);
                this.ctx.closePath();
                this.ctx.fillStyle = `rgba(6, 182, 212, ${ic.alpha * 1.5})`;
                this.ctx.fill();

                this.ctx.beginPath();
                this.ctx.moveTo(8, 4);
                this.ctx.lineTo(34, 4);
                this.ctx.strokeStyle = `rgba(6, 182, 212, ${ic.alpha * 1.3})`;
                this.ctx.lineWidth = 1.5;
                this.ctx.stroke();

                this.ctx.font = '9px monospace';
                this.ctx.fillStyle = `rgba(8, 145, 178, ${ic.alpha * 1.6})`;
                this.ctx.fillText('+3.60m', 12, 0);
            } else if (ic.type === 'CAD_CUBE') {
                // Isometric wireframe box (Digital Twin Building Block)
                const s = 12;
                this.ctx.strokeStyle = `rgba(99, 102, 241, ${ic.alpha * 1.4})`;
                this.ctx.lineWidth = 1;
                // Top rhombus
                this.ctx.beginPath();
                this.ctx.moveTo(0, -s);
                this.ctx.lineTo(s * 0.86, -s * 0.5);
                this.ctx.lineTo(0, 0);
                this.ctx.lineTo(-s * 0.86, -s * 0.5);
                this.ctx.closePath();
                this.ctx.stroke();
                // Left & Right drops
                this.ctx.beginPath();
                this.ctx.moveTo(0, 0);
                this.ctx.lineTo(0, s);
                this.ctx.moveTo(s * 0.86, -s * 0.5);
                this.ctx.lineTo(s * 0.86, s * 0.5);
                this.ctx.moveTo(-s * 0.86, -s * 0.5);
                this.ctx.lineTo(-s * 0.86, s * 0.5);
                this.ctx.lineTo(0, s);
                this.ctx.lineTo(s * 0.86, s * 0.5);
                this.ctx.stroke();
            } else {
                // Crosshairs
                this.ctx.strokeStyle = `rgba(100, 116, 139, ${ic.alpha * 1.3})`;
                this.ctx.lineWidth = 1;
                this.ctx.beginPath();
                this.ctx.moveTo(-10, 0);
                this.ctx.lineTo(10, 0);
                this.ctx.moveTo(0, -10);
                this.ctx.lineTo(0, 10);
                this.ctx.stroke();
            }

            this.ctx.restore();
        });
    }

    bindEvents() {
        window.addEventListener('resize', () => {
            this.width = window.innerWidth;
            this.height = window.innerHeight;
            this.canvas.width = this.width;
            this.canvas.height = this.height;
        });
    }
}

// ==========================================
// BIM AUDIO ENGINE: AMBIENT MUSIC & DRUM BEATS
// ==========================================
class BimAudioEngine {
    constructor() {
        this.ctx = null;
        this.isPlayingAmbient = false;
        this.isMuted = false;
        this.ambientGain = null;
        this.ambientOscillators = [];
        this.masterGain = null;
        this.drumGain = null;
        this.currentChordIndex = 0;
        this.chordInterval = null;

        // Lush ambient architectural chords (Hz) - Fsus2, Am7, Cmaj9, G6
        this.chords = [
            [174.61, 220.00, 261.63, 349.23, 523.25], // F major chord
            [220.00, 261.63, 329.63, 392.00, 523.25], // Am7 chord
            [130.81, 196.00, 246.94, 293.66, 392.00], // Cmaj9 chord
            [196.00, 246.94, 293.66, 392.00, 440.00]  // G6 chord
        ];
    }

    init() {
        if (this.ctx) return;
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        this.ctx = new AudioCtx();

        // Master gain
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(0.9, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);

        // Ambient synthesizer gain (soft, calming)
        this.ambientGain = this.ctx.createGain();
        this.ambientGain.gain.setValueAtTime(0.09, this.ctx.currentTime);
        this.ambientGain.connect(this.masterGain);

        // Drum gain (LOUD and crisp on button click)
        this.drumGain = this.ctx.createGain();
        this.drumGain.gain.setValueAtTime(0.95, this.ctx.currentTime);
        this.drumGain.connect(this.masterGain);
    }

    startAmbient() {
        this.init();
        if (!this.ctx) return;
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        if (this.isPlayingAmbient) return;
        this.isPlayingAmbient = true;
        this.isMuted = false;
        this.playNextChord();
        this.chordInterval = setInterval(() => this.playNextChord(), 5500);
        this.updateUiState(true);
    }

    stopAmbient() {
        this.isPlayingAmbient = false;
        this.isMuted = true;
        if (this.chordInterval) clearInterval(this.chordInterval);
        this.ambientOscillators.forEach(osc => {
            try { osc.stop(); osc.disconnect(); } catch(e){}
        });
        this.ambientOscillators = [];
        this.updateUiState(false);
    }

    toggle() {
        if (this.isPlayingAmbient) {
            this.stopAmbient();
        } else {
            this.startAmbient();
        }
    }

    playNextChord() {
        if (!this.isPlayingAmbient || !this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;
        const chord = this.chords[this.currentChordIndex];
        this.currentChordIndex = (this.currentChordIndex + 1) % this.chords.length;

        // Fade out previous oscillators
        const oldOscs = [...this.ambientOscillators];
        this.ambientOscillators = [];

        // Low-pass filter for warm, airy pad sound
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(650, now);
        filter.Q.setValueAtTime(2.0, now);
        filter.connect(this.ambientGain);

        chord.forEach(freq => {
            const osc = this.ctx.createOscillator();
            const noteGain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now);
            // Gentle detune for lush architectural ambience
            osc.detune.setValueAtTime((Math.random() - 0.5) * 8, now);

            // Gentle attack and slow release
            noteGain.gain.setValueAtTime(0.0001, now);
            noteGain.gain.exponentialRampToValueAtTime(0.045, now + 1.8);
            noteGain.gain.exponentialRampToValueAtTime(0.0001, now + 5.8);

            osc.connect(noteGain);
            noteGain.connect(filter);
            osc.start(now);
            osc.stop(now + 6.0);
            this.ambientOscillators.push(osc);
        });

        setTimeout(() => {
            oldOscs.forEach(o => { try { o.disconnect(); } catch(e){} });
        }, 2000);
    }

    playLoudDrumBeat() {
        this.init();
        if (!this.ctx) return;
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        const now = this.ctx.currentTime;

        // 1. LOUD PUNCHY SUB-BASS KICK DRUM
        const kickOsc = this.ctx.createOscillator();
        const kickGain = this.ctx.createGain();
        kickOsc.type = 'sine';
        // Rapid frequency sweep from 180 Hz down to 32 Hz
        kickOsc.frequency.setValueAtTime(180, now);
        kickOsc.frequency.exponentialRampToValueAtTime(32, now + 0.12);

        // Punchy attack envelope
        kickGain.gain.setValueAtTime(1.0, now);
        kickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        kickOsc.connect(kickGain);
        kickGain.connect(this.drumGain);
        kickOsc.start(now);
        kickOsc.stop(now + 0.36);

        // 2. CRISP ACOUSTIC SNARE / CLAP CRACK
        const bufferSize = Math.floor(this.ctx.sampleRate * 0.16);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const output = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.035));
        }

        const whiteNoise = this.ctx.createBufferSource();
        whiteNoise.buffer = buffer;

        const snareFilter = this.ctx.createBiquadFilter();
        snareFilter.type = 'bandpass';
        snareFilter.frequency.setValueAtTime(1250, now);
        snareFilter.Q.setValueAtTime(1.5, now);

        const snareGain = this.ctx.createGain();
        snareGain.gain.setValueAtTime(0.9, now);
        snareGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

        // Snare body tonal punch
        const snareTone = this.ctx.createOscillator();
        const toneGain = this.ctx.createGain();
        snareTone.type = 'triangle';
        snareTone.frequency.setValueAtTime(220, now);
        snareTone.frequency.exponentialRampToValueAtTime(80, now + 0.08);
        toneGain.gain.setValueAtTime(0.45, now);
        toneGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

        snareTone.connect(toneGain);
        toneGain.connect(this.drumGain);
        snareTone.start(now);
        snareTone.stop(now + 0.14);

        whiteNoise.connect(snareFilter);
        snareFilter.connect(snareGain);
        snareGain.connect(this.drumGain);
        whiteNoise.start(now);
    }

    updateUiState(isPlaying) {
        const visualizer = document.getElementById('audioWaveVisualizer');
        const badge = document.getElementById('audioStatusBadge');
        const icon = document.getElementById('audioIcon');

        if (!badge || !icon) return;

        if (isPlaying) {
            badge.textContent = 'ACTIVE';
            badge.className = 'ml-1.5 text-[9px] px-1.5 py-0.2 bg-emerald-500/20 text-emerald-400 rounded-full border border-emerald-500/30';
            icon.className = 'fa-solid fa-volume-high text-xs';
            if (visualizer) visualizer.classList.remove('opacity-30');
        } else {
            badge.textContent = 'MUTED';
            badge.className = 'ml-1.5 text-[9px] px-1.5 py-0.2 bg-slate-700 text-slate-400 rounded-full border border-slate-600';
            icon.className = 'fa-solid fa-volume-xmark text-xs';
            if (visualizer) visualizer.classList.add('opacity-30');
        }
    }
}

// Global Audio Engine Instance
const bimAudio = new BimAudioEngine();

function toggleAmbientMusic() {
    bimAudio.toggle();
}

// Global Click Dispatcher: Drums on buttons; NO drum beat on empty space
document.addEventListener('click', (e) => {
    // If ambient hasn't started yet, auto-start on first user gesture
    if (!bimAudio.isPlayingAmbient && !bimAudio.isMuted) {
        bimAudio.startAmbient();
    }

    // Check if clicked element or its closest parent is a button or interactive link
    const interactive = e.target.closest('button, a, input, select, textarea, [role="button"], .tab-btn, .interactive-click');
    if (interactive) {
        // User clicked a button: Play LOUD DRUM BEAT
        bimAudio.playLoudDrumBeat();
    } else {
        // User clicked empty space: NO LOUD DRUM BEAT
        // Leave completely silent as requested
    }
});

// Initial bootstrap
window.addEventListener('DOMContentLoaded', () => {
    loadPublicPricing();
    new BimCanvasAnimation('bimBackgroundCanvas');
    initAadiSketchWeb();
});

