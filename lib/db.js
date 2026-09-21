/**
 * FENBOT CLOUD Database Adapter (CommonJS)
 * Menghilangkan database JSON lokal untuk state bisnis.
 * Seluruh data user, dompet pelanggan, dan pesanan dimiliki sepenuhnya oleh PostgreSQL FENBOT CLOUD.
 */

const fs = require('fs');
const path = require('path');
const config = require('../config/config');
const lidHelper = require('./lidHelper');
const { fenbotClient } = require('./fenbot-client');

const dbDir = path.join(__dirname, '..', 'database');

// In-memory runtime cache (disposable, container tidak menjadi source of truth)
const memoryCache = {
    users: {},
    transactions: {},
    products: [],
    manual_products: [],
    settings: {},
    groups: {}
};

// Inisialisasi awal produk dan settings jika ada cache file lokal
const initDB = () => {
    try {
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }

        const productsFile = path.join(dbDir, 'products.json');
        if (fs.existsSync(productsFile)) {
            try {
                memoryCache.products = JSON.parse(fs.readFileSync(productsFile, 'utf-8'));
            } catch {
                memoryCache.products = [];
            }
        }

        const settingsFile = path.join(dbDir, 'settings.json');
        if (fs.existsSync(settingsFile)) {
            try {
                memoryCache.settings = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
            } catch {
                memoryCache.settings = {};
            }
        }

        if (fenbotClient.isConfigured) {
            console.log('\x1b[32m%s\x1b[0m', `[ FENBOT CLOUD ] Terhubung ke Control Plane: ${fenbotClient.apiUrl}`);
            console.log('\x1b[32m%s\x1b[0m', `[ FENBOT CLOUD ] Multi-Tenant Terisolasi Penuh: ${fenbotClient.instanceId}`);

            // Fetch dynamic settings from FENBOT CLOUD
            fenbotClient.fetchSettings().then(cloudSettings => {
                if (cloudSettings && Object.keys(cloudSettings).length > 0) {
                    memoryCache.settings = { ...memoryCache.settings, ...cloudSettings };
                    if (cloudSettings.profit_markup !== undefined) {
                        const markupDecimal = Number(cloudSettings.profit_markup) / 100;
                        memoryCache.settings.margins = {
                            ...(memoryCache.settings.margins || {}),
                            BRONZE: markupDecimal,
                            SILVER: Math.max(0, markupDecimal - 0.02),
                            GOLD: Math.max(0, markupDecimal - 0.03),
                            PLATINUM: Math.max(0, markupDecimal - 0.04),
                            OWNER: 0
                        };
                    }
                    console.log('\x1b[32m%s\x1b[0m', '[ FENBOT CLOUD ] Pengaturan bot berhasil disinkronisasi dari Cloud.');
                }
            }).catch(() => {});
        } else {
            console.log('\x1b[33m%s\x1b[0m', '[ FENBOT WARNING ] Bot berjalan tanpa konfigurasi instance FENBOT CLOUD.');
        }
    } catch (e) {
        console.error('[ DATABASE INIT ERROR ]', e.message);
    }
};

initDB();

const resolveTargetJid = (jid) => {
    if (!jid) return '';
    let target = lidHelper.toJid(jid);
    const users = memoryCache.users;
    if (users[jid]?.linkedTo) target = lidHelper.toJid(users[jid].linkedTo);
    if (users[target]?.linkedTo) target = lidHelper.toJid(users[target].linkedTo);
    return target;
};

const resolvePhoneFromJid = (jid) => {
    if (!jid) return '';
    const target = resolveTargetJid(jid);
    return target.split('@')[0].replace(/\D/g, '');
};

/**
 * Mengambil data user dari memory cache
 */
const getUser = (jid) => {
    let targetJid = resolveTargetJid(jid);
    if (!targetJid) targetJid = jid;

    if (!memoryCache.users[targetJid]) {
        memoryCache.users[targetJid] = {
            jid: targetJid,
            balance: 0,
            reservedBalance: 0,
            role: 'BRONZE',
            total_order: 0,
            registered: false,
            joinedAt: new Date().toISOString()
        };
    }
    return memoryCache.users[targetJid];
};

/**
 * Mengambil data user yang tersinkronisasi secara real-time dari PostgreSQL FENBOT CLOUD
 */
const getUserAsync = async (jid) => {
    let targetJid = resolveTargetJid(jid);
    if (!targetJid) targetJid = jid;
    const phone = resolvePhoneFromJid(targetJid);

    if (fenbotClient.isConfigured && phone) {
        try {
            const [cust, wallet] = await Promise.all([
                fenbotClient.getCustomer(phone),
                fenbotClient.getWallet(phone)
            ]);

            memoryCache.users[targetJid] = {
                ...(memoryCache.users[targetJid] || {}),
                jid: targetJid,
                phone: phone,
                balance: wallet ? Number(wallet.availableBalance || 0) : 0,
                reservedBalance: wallet ? Number(wallet.reservedBalance || 0) : 0,
                role: cust?.role || memoryCache.users[targetJid]?.role || 'BRONZE',
                registered: Boolean(cust || memoryCache.users[targetJid]?.registered),
                joinedAt: cust?.createdAt || memoryCache.users[targetJid]?.joinedAt || new Date().toISOString()
            };
            return memoryCache.users[targetJid];
        } catch (err) {
            console.warn('[ FENBOT CLOUD ] Gagal sinkronisasi user async:', err.message);
        }
    }

    return getUser(targetJid);
};

const isRegistered = (jid) => {
    const targetJid = resolveTargetJid(jid);
    return Boolean(memoryCache.users[targetJid] && memoryCache.users[targetJid].registered);
};

const updateUser = (jid, data) => {
    const targetJid = resolveTargetJid(jid);
    if (memoryCache.users[targetJid]) {
        memoryCache.users[targetJid] = { ...memoryCache.users[targetJid], ...data };
    }
};

const linkAccount = (lid, realJid) => {
    const normLid = lidHelper.cleanId(lid);
    const normReal = lidHelper.toJid(realJid);
    lidHelper.registerMapping(normLid, normReal);

    if (!memoryCache.users[normLid]) {
        memoryCache.users[normLid] = {
            jid: normLid,
            balance: 0,
            reservedBalance: 0,
            role: 'BRONZE',
            total_order: 0,
            registered: false,
            joinedAt: new Date().toISOString()
        };
    }
    memoryCache.users[normLid].linkedTo = normReal;
};

/**
 * METODE SALDO ACID TERINTEGRASI FENBOT CLOUD
 * Tidak ada mutasi lokal manual (TIDAK ADA: balance = balance - amount)
 */
const reserveBalance = async (jid, amount) => {
    const phone = resolvePhoneFromJid(jid);
    return await fenbotClient.reserveBalance(phone, amount);
};

const commitDebit = async (jid, amount) => {
    const phone = resolvePhoneFromJid(jid);
    const res = await fenbotClient.commitDebit(phone, amount);
    await getUserAsync(jid);
    return res;
};

const releaseReservation = async (jid, amount) => {
    const phone = resolvePhoneFromJid(jid);
    const res = await fenbotClient.releaseReservation(phone, amount);
    await getUserAsync(jid);
    return res;
};

const creditBalance = async (jid, amount, idempotencyKey) => {
    const phone = resolvePhoneFromJid(jid);
    const res = await fenbotClient.creditBalance(phone, amount, idempotencyKey);
    await getUserAsync(jid);
    return res;
};

const debitBalance = async (jid, amount, idempotencyKey) => {
    const phone = resolvePhoneFromJid(jid);
    const res = await fenbotClient.debitBalance(phone, amount, idempotencyKey);
    await getUserAsync(jid);
    return res;
};

/**
 * TRANSACTIONS
 * Disimpan di memory cache untuk runtime dan disinkronkan ke PostgreSQL FENBOT CLOUD
 */
const addTransaction = (id, data) => {
    memoryCache.transactions[id] = {
        id,
        time: new Date().toISOString(),
        status: 'pending',
        ...data
    };

    if (fenbotClient.isConfigured) {
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
    if (memoryCache.transactions[id]) {
        memoryCache.transactions[id] = { ...memoryCache.transactions[id], ...data };
    }
};

const hasPendingTransaction = (jid) => {
    let targetJid = jid;
    if (memoryCache.users[jid] && memoryCache.users[jid].linkedTo) {
        targetJid = memoryCache.users[jid].linkedTo;
    }
    return Object.values(memoryCache.transactions).some(t =>
        (t.user === jid || t.user === targetJid) && t.status === 'pending'
    );
};

/**
 * PRODUCTS
 */
const getProduct = (sku) => {
    return memoryCache.products.find(p => p.buyer_sku_code && p.buyer_sku_code.toLowerCase() === sku.toLowerCase());
};

const updateProducts = (productsList) => {
    if (!Array.isArray(productsList)) return false;
    memoryCache.products = productsList;
    try {
        fs.writeFileSync(path.join(dbDir, 'products.json'), JSON.stringify(productsList, null, 2), 'utf-8');
    } catch {}
    return true;
};

/**
 * MANUAL PRODUCTS
 */
const getManualProducts = () => memoryCache.manual_products;

const addManualProduct = (data) => {
    memoryCache.manual_products.push({ id: Date.now(), ...data });
};

const delManualProduct = (name) => {
    const initialLength = memoryCache.manual_products.length;
    memoryCache.manual_products = memoryCache.manual_products.filter(p => p.name.toLowerCase() !== name.toLowerCase());
    return memoryCache.manual_products.length < initialLength;
};

/**
 * GROUPS
 */
const getGroupSettings = (jid) => {
    if (!memoryCache.groups[jid]) {
        memoryCache.groups[jid] = { antilink: false };
    }
    return memoryCache.groups[jid];
};

const updateGroupSettings = (jid, data) => {
    memoryCache.groups[jid] = { ...(memoryCache.groups[jid] || {}), ...data };
};

/**
 * SETTINGS
 */
const getSettings = () => {
    const settings = memoryCache.settings;
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
        gsheetUrl: '',
        thumbnailUrl: '',
        topupThumbnailUrl: '',
        publicMode: true
    };

    for (const key in defaults) {
        if (settings[key] === undefined) {
            settings[key] = defaults[key];
        }
    }
    return settings;
};

const updateSettings = (data) => {
    memoryCache.settings = { ...memoryCache.settings, ...data };
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
    creditBalance,
    debitBalance,
    hasPendingTransaction,
    addTransaction,
    updateTransaction,
    getProduct: (sku) => getProduct(sku),
    updateProducts,
    getManualProducts,
    addManualProduct,
    delManualProduct,
    getGroupSettings,
    updateGroupSettings,
    getSettings,
    updateSettings,
    readDB: () => {
        return {
            users: memoryCache.users,
            transactions: memoryCache.transactions,
            products: memoryCache.products,
            manual_products: memoryCache.manual_products,
            settings: memoryCache.settings,
            groups: memoryCache.groups
        };
    }
};
