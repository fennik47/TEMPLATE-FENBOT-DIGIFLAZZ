const fs = require('fs');
const path = require('path');
const config = require('../config/config');
const lidHelper = require('./lidHelper');
const { fenbotClient } = require('./fenbot-client');

const dbDir = path.join(__dirname, '..', 'database');
const paths = {
    users: path.join(dbDir, 'users.json'),
    transactions: path.join(dbDir, 'transactions.json'),
    products: path.join(dbDir, 'products.json'),
    manual_products: path.join(dbDir, 'manual_products.json'),
    settings: path.join(dbDir, 'settings.json'),
    sewa_panel: path.join(dbDir, 'sewa_panel.json'),
    groups: path.join(dbDir, 'groups.json')
};

let cache = {};
let isFenbotCloud = fenbotClient.isConfigured;

// Initialize Database
const initDB = () => {
    try {
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }
        for (let key in paths) {
            if (fs.existsSync(paths[key])) {
                try {
                    cache[key] = JSON.parse(fs.readFileSync(paths[key], 'utf-8'));
                } catch {
                    cache[key] = (key === 'users' || key === 'transactions' || key === 'groups' || key === 'settings') ? {} : [];
                }
            } else {
                cache[key] = (key === 'users' || key === 'transactions' || key === 'groups' || key === 'settings') ? {} : [];
            }
        }

        if (isFenbotCloud) {
            console.log('\x1b[32m%s\x1b[0m', `[ FENBOT CLOUD ] Terhubung ke FENBOT CLOUD Control Plane (${fenbotClient.apiUrl})`);
            console.log('\x1b[32m%s\x1b[0m', `[ FENBOT CLOUD ] Mode Multi-Tenant Aktif - Database Terisolasi Penuh untuk Instance: ${process.env.INSTANCE_ID || 'local'}`);

            // Fetch dynamic settings from FENBOT CLOUD
            fenbotClient.fetchSettings().then(cloudSettings => {
                if (cloudSettings && Object.keys(cloudSettings).length > 0) {
                    cache.settings = { ...cache.settings, ...cloudSettings };
                    if (cloudSettings.profit_markup !== undefined) {
                        const markupDecimal = Number(cloudSettings.profit_markup) / 100;
                        cache.settings.margins = {
                            ...(cache.settings.margins || {}),
                            BRONZE: markupDecimal,
                            SILVER: Math.max(0, markupDecimal - 0.02),
                            GOLD: Math.max(0, markupDecimal - 0.03),
                            PLATINUM: Math.max(0, markupDecimal - 0.04),
                            OWNER: 0
                        };
                    }
                    write('settings', cache.settings);
                    console.log('\x1b[32m%s\x1b[0m', '[ FENBOT CLOUD ] Pengaturan bot berhasil disinkronisasi dari Cloud.');
                }
            }).catch(() => {});

            // Start periodic heartbeat telemetry
            setInterval(() => {
                fenbotClient.sendHeartbeat().catch(() => {});
            }, 45000);
        } else {
            console.log('\x1b[33m%s\x1b[0m', '[ DATABASE ] Menggunakan Local JSON Database (Mode Standalone/Offline).');
        }
    } catch (e) {
        console.error('[ DATABASE ERROR ]', e);
    }
};

// Jalankan saat file diload
initDB();

const read = (key) => {
    if (!cache[key]) {
        cache[key] = (key === 'users' || key === 'transactions' || key === 'groups' || key === 'settings') ? {} : [];
    }
    return cache[key];
};

const write = (key, data) => {
    cache[key] = data; // Update memori secara sinkronus agar bot super cepat
    try {
        fs.writeFileSync(paths[key], JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
        console.warn(`[ DATABASE WRITE WARNING ] Gagal menulis ${key}:`, err.message);
    }
};

const resolveTargetJid = (jid) => {
    if (!jid) return '';
    let target = lidHelper.toJid(jid);
    const users = read('users');
    if (users[jid]?.linkedTo) target = lidHelper.toJid(users[jid].linkedTo);
    if (users[target]?.linkedTo) target = lidHelper.toJid(users[target].linkedTo);
    return target;
};

const resolvePhoneFromJid = (jid) => {
    if (!jid) return '';
    const target = resolveTargetJid(jid);
    return target.split('@')[0].replace(/\D/g, '');
};

const getUser = (jid) => {
    const users = read('users');
    let targetJid = resolveTargetJid(jid);
    if (!targetJid) targetJid = jid;

    if (!users[targetJid]) {
        users[targetJid] = {
            jid: targetJid,
            balance: 0,
            role: 'BRONZE',
            total_order: 0,
            registered: false,
            joinedAt: new Date().toISOString()
        };
        write('users', users);
    }
    return users[targetJid];
};

/**
 * Mengambil data user yang tersinkronisasi secara real-time dari FENBOT CLOUD
 */
const getUserAsync = async (jid) => {
    let targetJid = resolveTargetJid(jid);
    if (!targetJid) targetJid = jid;
    const phone = resolvePhoneFromJid(targetJid);

    if (isFenbotCloud && phone) {
        try {
            const [cust, wallet] = await Promise.all([
                fenbotClient.getCustomer(phone),
                fenbotClient.getWallet(phone)
            ]);

            const users = read('users');
            users[targetJid] = {
                ...(users[targetJid] || {}),
                jid: targetJid,
                phone: phone,
                balance: wallet ? Number(wallet.availableBalance || 0) : (users[targetJid]?.balance || 0),
                reservedBalance: wallet ? Number(wallet.reservedBalance || 0) : 0,
                role: cust?.role || users[targetJid]?.role || 'BRONZE',
                registered: Boolean(cust || users[targetJid]?.registered),
                joinedAt: cust?.createdAt || users[targetJid]?.joinedAt || new Date().toISOString()
            };
            write('users', users);
            return users[targetJid];
        } catch (err) {
            console.warn('[ FENBOT CLOUD ] Gagal sinkronisasi user async:', err.message);
        }
    }

    return getUser(targetJid);
};

const isRegistered = (jid) => {
    const users = read('users');
    const targetJid = resolveTargetJid(jid);
    return Boolean(users[targetJid] && users[targetJid].registered);
};

const updateUser = (jid, data) => {
    const users = read('users');
    const targetJid = resolveTargetJid(jid);
    if (users[targetJid]) {
        users[targetJid] = { ...users[targetJid], ...data };
        write('users', users);
    }
};

const linkAccount = (lid, realJid) => {
    const users = read('users');
    const normLid = lidHelper.cleanId(lid);
    const normReal = lidHelper.toJid(realJid);
    lidHelper.registerMapping(normLid, normReal);

    if (!users[normLid]) {
        users[normLid] = {
            jid: normLid,
            balance: 0,
            role: 'BRONZE',
            total_order: 0,
            registered: false,
            joinedAt: new Date().toISOString()
        };
    }
    users[normLid].linkedTo = normReal;
    write('users', users);
};

/**
 * METODE SALDO ACID TERINTEGRASI FENBOT CLOUD
 */
const reserveBalance = async (jid, amount) => {
    if (!isFenbotCloud) {
        const user = getUser(jid);
        if (user.balance < amount) {
            const err = new Error('INSUFFICIENT_BALANCE');
            err.code = 'INSUFFICIENT_BALANCE';
            throw err;
        }
        return { success: true, bypassed: true };
    }
    const phone = resolvePhoneFromJid(jid);
    return await fenbotClient.reserveBalance(phone, amount);
};

const commitDebit = async (jid, amount) => {
    if (!isFenbotCloud) {
        const user = getUser(jid);
        user.balance = Math.max(0, user.balance - amount);
        updateUser(jid, { balance: user.balance });
        return { success: true, bypassed: true };
    }
    const phone = resolvePhoneFromJid(jid);
    const res = await fenbotClient.commitDebit(phone, amount);
    await getUserAsync(jid);
    return res;
};

const releaseReservation = async (jid, amount) => {
    if (!isFenbotCloud) {
        return { success: true, bypassed: true };
    }
    const phone = resolvePhoneFromJid(jid);
    const res = await fenbotClient.releaseReservation(phone, amount);
    await getUserAsync(jid);
    return res;
};

/**
 * TRANSACTIONS
 */
const addTransaction = (id, data) => {
    const transactions = read('transactions');
    transactions[id] = { 
        id, 
        time: new Date().toISOString(),
        status: 'pending',
        ...data 
    };
    write('transactions', transactions);

    // Sync order ke PostgreSQL FENBOT CLOUD jika terhubung
    if (isFenbotCloud) {
        const phone = resolvePhoneFromJid(data.user);
        fenbotClient.recordOrder({
            id,
            customerId: phone,
            customerPhone: phone,
            sku: data.sku,
            productName: data.product_name || data.sku,
            sellingPrice: data.price,
            costPrice: data.modal || Math.round(data.price * 0.95),
            destinationNo: data.target,
            status: data.status ? data.status.toUpperCase() : 'PENDING',
            provider: 'digiflazz',
            providerRef: id
        }).catch(e => console.warn('[ FENBOT CLOUD ] Gagal sync order:', e.message));
    }
};

const updateTransaction = (id, data) => {
    const transactions = read('transactions');
    if (transactions[id]) {
        transactions[id] = { ...transactions[id], ...data };
        write('transactions', transactions);
    }
};

const hasPendingTransaction = (jid) => {
    const users = read('users');
    const transactions = read('transactions');
    let targetJid = jid;
    if (users[jid] && users[jid].linkedTo) targetJid = users[jid].linkedTo;

    return Object.values(transactions).some(t => 
        (t.user === jid || t.user === targetJid) && t.status === 'pending'
    );
};

/**
 * PRODUCTS
 */
const getProduct = (sku) => {
    const products = read('products');
    return products.find(p => p.buyer_sku_code && p.buyer_sku_code.toLowerCase() === sku.toLowerCase());
};

const updateProducts = (productsList) => {
    if (!Array.isArray(productsList)) return false;
    write('products', productsList);
    return true;
};

/**
 * MANUAL PRODUCTS
 */
const getManualProducts = () => read('manual_products');

const addManualProduct = (data) => {
    const manual = read('manual_products');
    manual.push({
        id: Date.now(),
        ...data
    });
    write('manual_products', manual);
};

const delManualProduct = (name) => {
    const manual = read('manual_products');
    const initialLength = manual.length;
    const filtered = manual.filter(p => p.name.toLowerCase() !== name.toLowerCase());
    write('manual_products', filtered);
    return filtered.length < initialLength;
};

/**
 * SEWA PANEL
 */
const getSewaPanel = () => read('sewa_panel');

const addSewaPanel = (data) => {
    const sewa = read('sewa_panel');
    sewa.push({
        id: Date.now(),
        ...data,
        tagihanSent: false,
        suspended: false
    });
    write('sewa_panel', sewa);
};

const delSewaPanel = (id) => {
    const sewa = read('sewa_panel');
    const initialLength = sewa.length;
    const filtered = sewa.filter(p => p.id !== id && p.server_id !== id);
    write('sewa_panel', filtered);
    return filtered.length < initialLength;
};

const updateSewaPanel = (id, data) => {
    const sewa = read('sewa_panel');
    const index = sewa.findIndex(p => p.id === id);
    if (index !== -1) {
        sewa[index] = { ...sewa[index], ...data };
        write('sewa_panel', sewa);
    }
};

/**
 * GROUPS
 */
const getGroupSettings = (jid) => {
    const groups = read('groups');
    if (!groups[jid]) {
        groups[jid] = { antilink: false };
        write('groups', groups);
    }
    return groups[jid];
};

const updateGroupSettings = (jid, data) => {
    const groups = read('groups');
    groups[jid] = { ...groups[jid], ...data };
    write('groups', groups);
};

/**
 * SETTINGS
 */
const getSettings = () => {
    const settings = read('settings');
    const defaults = {
        margins: {
            BRONZE: 0.10,
            SILVER: 0.07,
            GOLD: 0.05,
            PLATINUM: 0.03,
            OWNER: 0
        },
        upgradePrices: {
            SILVER: 50000,
            GOLD: 100000,
            PLATINUM: 150000
        },
        panelPrices: {
            "1gb": 5000, "2gb": 10000, "3gb": 15000, "4gb": 20000, "5gb": 25000,
            "6gb": 30000, "7gb": 35000, "8gb": 40000, "9gb": 45000, "10gb": 50000,
            "unlimited": 100000
        },
        gsheetUrl: '',
        thumbnailUrl: '',
        topupThumbnailUrl: '',
        publicMode: true
    };

    let changed = false;
    for (const key in defaults) {
        if (settings[key] === undefined) {
            settings[key] = defaults[key];
            changed = true;
        }
    }
    if (changed) write('settings', settings);
    return settings;
};

const updateSettings = (data) => {
    const settings = read('settings');
    const updated = { ...settings, ...data };
    write('settings', updated);
};

module.exports = {
    getUser,
    getUserAsync,
    isRegistered,
    updateUser,
    linkAccount,
    reserveBalance,
    commitDebit,
    releaseReservation,
    hasPendingTransaction,
    addTransaction,
    updateTransaction,
    getProduct: (sku) => getProduct(sku),
    updateProducts,
    getManualProducts,
    addManualProduct,
    delManualProduct,
    getSewaPanel,
    addSewaPanel,
    delSewaPanel,
    updateSewaPanel,
    getGroupSettings,
    updateGroupSettings,
    getSettings,
    updateSettings,
    readDB: () => {
        return {
            users: read('users'),
            transactions: read('transactions'),
            products: read('products'),
            manual_products: read('manual_products'),
            settings: read('settings'),
            sewa_panel: read('sewa_panel'),
            groups: read('groups')
        };
    }
};
