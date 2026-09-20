const fs = require('fs-extra');
const path = require('path');
const config = require('../config/config');
const lidHelper = require('./lidHelper');

let admin;
try {
    admin = require('firebase-admin');
} catch (e) {
    admin = null;
}

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
let dbRef = null;
let isFirebase = false;

// Helper to sanitize Firebase keys (replace dots with _DOT_)
const sanitizeKey = (key) => key.replace(/\./g, '_DOT_').replace(/#/g, '_HASH_').replace(/\$/g, '_DOLLAR_').replace(/\[/g, '_LSQB_').replace(/\]/g, '_RSQB_');
const restoreKey = (key) => key.replace(/_DOT_/g, '.').replace(/_HASH_/g, '#').replace(/_DOLLAR_/g, '$').replace(/_LSQB_/g, '[').replace(/_RSQB_/g, ']');

const sanitizeObject = (obj) => {
    if (typeof obj !== 'object' || obj === null) return obj;
    if (Array.isArray(obj)) return obj.map(sanitizeObject);
    const newObj = {};
    for (let key in obj) {
        newObj[sanitizeKey(key)] = sanitizeObject(obj[key]);
    }
    return newObj;
};

const restoreObject = (obj) => {
    if (typeof obj !== 'object' || obj === null) return obj;
    if (Array.isArray(obj)) return obj.map(restoreObject);
    const newObj = {};
    for (let key in obj) {
        newObj[restoreKey(key)] = restoreObject(obj[key]);
    }
    return newObj;
};

// Initialize Database
const initDB = () => {
    try {
        const serviceAccountPath = path.join(__dirname, '..', 'firebase-key.json');
        
        // Cek jika modul firebase-admin ada, dan kunci ada
        if (admin && fs.existsSync(serviceAccountPath)) {
            const serviceAccount = require(serviceAccountPath);
            const dbUrl = config.firebaseUrl || `https://${serviceAccount.project_id}-default-rtdb.firebaseio.com`;
            
            if (!admin.apps.length) {
                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount),
                    databaseURL: dbUrl
                });
            }
            dbRef = admin.database();
            isFirebase = true;
            console.log('\x1b[32m%s\x1b[0m', '[ FIREBASE ] Menghubungkan ke database Firebase Realtime...');
            
            // Memuat data awal dari lokal untuk berjaga-jaga
            for (let key in paths) {
                if (fs.existsSync(paths[key])) cache[key] = fs.readJsonSync(paths[key]);
                else cache[key] = (key === 'users' || key === 'transactions' || key === 'groups' || key === 'settings') ? {} : [];
            }

            // Sync dari Firebase
            dbRef.ref('/').once('value').then(snapshot => {
                if (snapshot.exists()) {
                    const data = restoreObject(snapshot.val());
                    cache = { ...cache, ...data };
                    console.log('\x1b[32m%s\x1b[0m', '[ FIREBASE ] Data berhasil disinkronisasi dari Cloud.');
                } else {
                    // Upload data lokal ke Firebase jika Firebase masih kosong
                    dbRef.ref('/').set(sanitizeObject(cache)).catch(e => console.error('[ FIREBASE UPLOAD ERROR ]', e.message));
                    console.log('\x1b[33m%s\x1b[0m', '[ FIREBASE ] Database Cloud kosong, melakukan upload data lokal...');
                }

                // Listen untuk perubahan dari panel atau instance lain
                dbRef.ref('/').on('value', (snap) => {
                    if (snap.exists()) cache = { ...cache, ...restoreObject(snap.val()) };
                });
            }).catch(e => console.error('[ FIREBASE ERROR ]', e.message));

        } else {
            console.log('\x1b[33m%s\x1b[0m', '[ DATABASE ] Menggunakan Local JSON (Firebase belum dikonfigurasi).');
            // Hanya menggunakan lokal
            for (let key in paths) {
                if (fs.existsSync(paths[key])) cache[key] = fs.readJsonSync(paths[key]);
                else cache[key] = (key === 'users' || key === 'transactions' || key === 'groups' || key === 'settings') ? {} : [];
            }
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
    
    // Tulis ke JSON lokal sebagai Backup Instan
    fs.writeJsonSync(paths[key], data, { spaces: 2 });
    
    // Kirim ke Firebase Cloud
    if (isFirebase && dbRef) {
        dbRef.ref(`/${key}`).set(sanitizeObject(data)).catch(e => console.error('[ FIREBASE WRITE ERROR ]', e.message));
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
    return products.find(p => p.buyer_sku_code.toLowerCase() === sku.toLowerCase());
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
    isRegistered,
    updateUser,
    linkAccount,
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
