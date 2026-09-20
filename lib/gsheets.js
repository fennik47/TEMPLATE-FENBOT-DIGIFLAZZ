const axios = require('axios');
const db = require('./db');

const sendToSheet = async (data) => {
    try {
        const settings = db.getSettings();
        const sheetUrl = settings.gsheetUrl;

        if (!sheetUrl || sheetUrl === '') {
            console.log('[ GSHEETS ] URL tidak diatur. Melewati...');
            return;
        }

        // Dapatkan role user
        const userData = db.getUser(data.user);
        const role = userData ? userData.role : "-";

        // Prepare data for Google Apps Script
        // Mengirimkan berbagai variasi key (Inggris, Indonesia, UPPERCASE) agar kebal terhadap script apapun
        const payload = {
            // LOWERCASE
            id: data.id || "-",
            id_transaksi: data.id || "-",
            date: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
            waktu: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
            user: data.user ? data.user.split('@')[0] : "-",
            role: role,
            produk: data.product_name || data.sku || "-",
            target: data.target || "-",
            modal: data.modal || 0,
            harga: data.price || 0,
            harga_jual: data.price || 0,
            profit: (data.price || 0) - (data.modal || 0),
            sn: data.sn || "-",
            status: data.status || "-",
            
            // UPPERCASE (Sesuai dengan header di screenshot)
            "ID TRANSAKSI": data.id || "-",
            "WAKTU": new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
            "USER": data.user ? data.user.split('@')[0] : "-",
            "ROLE": role,
            "PRODUK": data.product_name || data.sku || "-",
            "TARGET": data.target || "-",
            "MODAL": data.modal || 0,
            "HARGA": data.price || 0,
            "HARGA JUAL": data.price || 0,
            "PROFIT": (data.price || 0) - (data.modal || 0),
            "SN": data.sn || "-",
            "STATUS": data.status || "-",
            
            // TITLE CASE
            "ID Transaksi": data.id || "-",
            "Waktu": new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
            "User": data.user ? data.user.split('@')[0] : "-",
            "Role": role,
            "Produk": data.product_name || data.sku || "-",
            "Target": data.target || "-",
            "Modal": data.modal || 0,
            "Harga Jual": data.price || 0,
            "Profit": (data.price || 0) - (data.modal || 0),
            "Status": data.status || "-"
        };

        await axios.post(sheetUrl, payload);
        console.log(`[ GSHEETS ] Berhasil mencatat transaksi ${data.id}`);
    } catch (err) {
        console.error('[ GSHEETS ERROR ]', err.message);
    }
};

module.exports = { sendToSheet };
