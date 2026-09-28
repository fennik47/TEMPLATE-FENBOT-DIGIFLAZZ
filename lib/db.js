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
    deposits: {},
    qris_orders: {},
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

        const depositsFile = path.join(dbDir, 'deposits.json');
        if (fs.existsSync(depositsFile)) {
            try {
                memoryCache.deposits = JSON.parse(fs.readFileSync(depositsFile, 'utf-8'));
            } catch {
                memoryCache.deposits = {};
            }
        }

        const qrisOrdersFile = path.join(dbDir, 'qris_orders.json');
        if (fs.existsSync(qrisOrdersFile)) {
            try {
                memoryCache.qris_orders = JSON.parse(fs.readFileSync(qrisOrdersFile, 'utf-8'));
            } catch {
                memoryCache.qris_orders = {};
            }
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

            // Fetch dynamic settings from FENBOT CLOUD (Initial & Periodic)
            const syncCloudSettings = async () => {
                try {
                    const cloudSettings = await fenbotClient.fetchSettings();
                    if (cloudSettings && Object.keys(cloudSettings).length > 0) {
                        memoryCache.settings = { ...memoryCache.settings, ...cloudSettings };
                        
                        // Persist to local cache settings.json
                        try {
                            const settingsFile = path.join(dbDir, 'settings.json');
                            fs.writeFileSync(settingsFile, JSON.stringify(memoryCache.settings, null, 2), 'utf-8');
                        } catch {}

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
                    }
                } catch (err) {
                    // Ignore transient network errors
                }
            };

            syncCloudSettings().then(() => {
                console.log('\x1b[32m%s\x1b[0m', '[ FENBOT CLOUD ] Pengaturan bot berhasil disinkronisasi dari Cloud.');
            });
            setInterval(syncCloudSettings, 15000);
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
    const phone = resolvePhoneFromJid(targetJid);

    if (!memoryCache.users[targetJid]) {
        memoryCache.users[targetJid] = {
            jid: targetJid,
            nomor: phone,
            name: 'Pengguna',
            balance: 0,
            reservedBalance: 0,
            role: 'BRONZE',
            total_order: 0,
            registered: true,
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
            let [cust, wallet] = await Promise.all([
                fenbotClient.getCustomer(phone),
                fenbotClient.getWallet(phone)
            ]);

            // Jika belum ditemukan dengan prefix 628, coba cek format 08
            if (!wallet && phone.startsWith('628')) {
                const alt = '0' + phone.slice(2);
                wallet = await fenbotClient.getWallet(alt);
            } else if (!wallet && phone.startsWith('08')) {
                const alt = '62' + phone.slice(1);
                wallet = await fenbotClient.getWallet(alt);
            }

            memoryCache.users[targetJid] = {
                ...(memoryCache.users[targetJid] || {}),
                jid: targetJid,
                phone: phone,
                balance: wallet ? Number(wallet.availableBalance || 0) : 0,
                reservedBalance: wallet ? Number(wallet.reservedBalance || 0) : 0,
                role: cust?.role || memoryCache.users[targetJid]?.role || 'BRONZE',
                registered: true,
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
    return true;
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
 * Menggunakan transaksi row-level locking di cloud jika terhubung,
 * atau memoryCache fallback jika unconfigured.
 */
const reserveBalance = async (jid, amount) => {
    let targetJid = resolveTargetJid(jid) || jid;
    const phone = resolvePhoneFromJid(targetJid);
    if (fenbotClient.isConfigured && phone) {
        return await fenbotClient.reserveBalance(phone, amount);
    }
    const user = getUser(targetJid);
    const currentBal = Number(user.balance) || 0;
    if (currentBal < Number(amount)) {
        const err = new Error('Saldo tidak mencukupi untuk transaksi ini.');
        err.code = 'INSUFFICIENT_BALANCE';
        throw err;
    }
    user.balance = currentBal - Number(amount);
    user.reservedBalance = (Number(user.reservedBalance) || 0) + Number(amount);
    return { success: true, availableBalance: user.balance, reservedBalance: user.reservedBalance };
};

const commitDebit = async (jid, amount) => {
    let targetJid = resolveTargetJid(jid) || jid;
    const phone = resolvePhoneFromJid(targetJid);
    if (fenbotClient.isConfigured && phone) {
        const res = await fenbotClient.commitDebit(phone, amount);
        await getUserAsync(targetJid);
        return res;
    }
    const user = getUser(targetJid);
    user.reservedBalance = Math.max(0, (Number(user.reservedBalance) || 0) - Number(amount));
    return { success: true, availableBalance: user.balance, reservedBalance: user.reservedBalance };
};

const releaseReservation = async (jid, amount) => {
    let targetJid = resolveTargetJid(jid) || jid;
    const phone = resolvePhoneFromJid(targetJid);
    if (fenbotClient.isConfigured && phone) {
        const res = await fenbotClient.releaseReservation(phone, amount);
        await getUserAsync(targetJid);
        return res;
    }
    const user = getUser(targetJid);
    const releaseAmt = Math.min(Number(user.reservedBalance) || 0, Number(amount));
    user.reservedBalance = (Number(user.reservedBalance) || 0) - releaseAmt;
    user.balance = (Number(user.balance) || 0) + releaseAmt;
    return { success: true, availableBalance: user.balance, reservedBalance: user.reservedBalance };
};

const creditBalance = async (jid, amount, idempotencyKey) => {
    let targetJid = resolveTargetJid(jid) || jid;
    const phone = resolvePhoneFromJid(targetJid);
    if (fenbotClient.isConfigured && phone) {
        // Auto-provisioning wallet di Cloud jika belum ada
        await fenbotClient.getWallet(phone).catch(() => {});
        const res = await fenbotClient.creditBalance(phone, amount, idempotencyKey);
        await getUserAsync(targetJid);
        return res;
    }
    const user = getUser(targetJid);
    user.balance = (Number(user.balance) || 0) + Number(amount);
    return { credited: true, availableBalance: user.balance, reservedBalance: user.reservedBalance || 0 };
};

const debitBalance = async (jid, amount, idempotencyKey) => {
    let targetJid = resolveTargetJid(jid) || jid;
    const phone = resolvePhoneFromJid(targetJid);
    if (fenbotClient.isConfigured && phone) {
        await fenbotClient.getWallet(phone).catch(() => {});
        const res = await fenbotClient.debitBalance(phone, amount, idempotencyKey);
        await getUserAsync(targetJid);
        return res;
    }
    const user = getUser(targetJid);
    const currentBal = Number(user.balance) || 0;
    if (currentBal < Number(amount)) {
        const err = new Error('Saldo tidak mencukupi untuk pemotongan.');
        err.code = 'INSUFFICIENT_BALANCE';
        throw err;
    }
    user.balance = currentBal - Number(amount);
    return { debited: true, availableBalance: user.balance, reservedBalance: user.reservedBalance || 0 };
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
    const now = Date.now();
    return Object.values(memoryCache.transactions).some(t => {
        if ((t.user === jid || t.user === targetJid) && t.status === 'pending') {
            const trxTime = t.time ? new Date(t.time).getTime() : 0;
            // Jika transaksi pending sudah lebih dari 5 menit (misal sandbox dev macet), jangan blokir transaksi baru
            if (trxTime && (now - trxTime > 5 * 60 * 1000)) {
                return false;
            }
            return true;
        }
        return false;
    });
};

/**
 * DEPOSITS (QRIS & Payment Gateway)
 */
const saveDepositsToDisk = () => {
    try {
        fs.writeFileSync(path.join(dbDir, 'deposits.json'), JSON.stringify(memoryCache.deposits, null, 2), 'utf-8');
    } catch {}
};

const addDeposit = (depositData) => {
    const id = depositData.id || `DEP-${Date.now()}`;
    memoryCache.deposits[id] = {
        id,
        status: 'pending',
        createdAt: new Date().toISOString(),
        ...depositData
    };
    saveDepositsToDisk();
    return memoryCache.deposits[id];
};

const getDeposit = (idOrRef) => {
    if (!idOrRef) return null;
    if (memoryCache.deposits[idOrRef]) return memoryCache.deposits[idOrRef];
    return Object.values(memoryCache.deposits).find(d => d.ref_no === idOrRef || d.id === idOrRef) || null;
};

const updateDeposit = (idOrRef, updates = {}) => {
    const dep = getDeposit(idOrRef);
    if (dep) {
        Object.assign(dep, updates, { updatedAt: new Date().toISOString() });
        saveDepositsToDisk();
        return dep;
    }
    return null;
};

const getPendingDeposits = () => {
    return Object.values(memoryCache.deposits).filter(d => d.status === 'pending');
};

const hasPendingDeposit = (jid) => {
    const targetJid = resolveTargetJid(jid) || jid;
    return Object.values(memoryCache.deposits).some(d => {
        if (d.status !== 'pending') return false;
        const depJid = resolveTargetJid(d.user) || d.user;
        return depJid === targetJid;
    });
};

/**
 * QRIS DIRECT ORDERS (Pembelian Digiflazz Langsung Bayar via QRIS)
 */
const saveQrisOrdersToDisk = () => {
    try {
        fs.writeFileSync(path.join(dbDir, 'qris_orders.json'), JSON.stringify(memoryCache.qris_orders, null, 2), 'utf-8');
    } catch {}
};

const addQrisOrder = (orderData) => {
    const id = orderData.id || `QTRX${Date.now()}`;
    memoryCache.qris_orders[id] = {
        id,
        status: 'pending',
        createdAt: new Date().toISOString(),
        ...orderData
    };
    saveQrisOrdersToDisk();
    return memoryCache.qris_orders[id];
};

const getQrisOrder = (idOrRef) => {
    if (!idOrRef) return null;
    if (memoryCache.qris_orders[idOrRef]) return memoryCache.qris_orders[idOrRef];
    return Object.values(memoryCache.qris_orders).find(o => o.ref_no === idOrRef || o.id === idOrRef) || null;
};

const updateQrisOrder = (idOrRef, updates = {}) => {
    const ord = getQrisOrder(idOrRef);
    if (ord) {
        Object.assign(ord, updates, { updatedAt: new Date().toISOString() });
        saveQrisOrdersToDisk();
        return ord;
    }
    return null;
};

const getPendingQrisOrders = () => {
    return Object.values(memoryCache.qris_orders).filter(o => o.status === 'pending');
};

const hasPendingQrisOrder = (jid) => {
    const targetJid = resolveTargetJid(jid) || jid;
    return Object.values(memoryCache.qris_orders).some(o => {
        if (o.status !== 'pending' && o.status !== 'process') return false;
        const ordJid = resolveTargetJid(o.user) || o.user;
        return ordJid === targetJid;
    });
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
    addDeposit,
    getDeposit,
    updateDeposit,
    getPendingDeposits,
    hasPendingDeposit,
    addQrisOrder,
    getQrisOrder,
    updateQrisOrder,
    getPendingQrisOrders,
    hasPendingQrisOrder,
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
            deposits: memoryCache.deposits,
            qris_orders: memoryCache.qris_orders,
            products: memoryCache.products,
            manual_products: memoryCache.manual_products,
            settings: memoryCache.settings,
            groups: memoryCache.groups
        };
    }
};
