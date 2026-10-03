const fs = require('fs-extra');
const path = require('path');
const db = require('../lib/db');
const arbakti = require('../lib/arbakti');

module.exports = {
    name: "setarbakti",
    aliases: ["setqris", "setarbaktipay", "setmustika"],
    run: async (sock, m, { args, isOwner, config }) => {
        if (!isOwner) return sock.reply(m.chat, "❌ Perintah ini khusus untuk Owner bot!", m);

        if (!args || args.length < 1) {
            const rawKey = arbakti.apiKey || "";
            const currentKey = rawKey.length > 7
                ? (rawKey.slice(0, 4) + '****' + rawKey.slice(-4))
                : (rawKey ? '****' : '(belum diatur)');
            const currentApp = arbakti.appId || '(Otomatis terdeteksi dari akun)';

            let text = `⚙️ *PENGATURAN ARBAKTI (QRIS OTOMATIS)*\n\n`;
            text += `• API Key     : *${currentKey}*\n`;
            text += `• ID Aplikasi : *${currentApp}*\n`;
            text += `• Gateway     : *https://payment.arbakti.monster*\n\n`;
            text += `💡 *Cara Penggunaan:*\n`;
            text += `1. Atur API Key & ID Aplikasi sekaligus:\n`;
            text += `   \`.setarbakti [api_key] [id_aplikasi]\`\n`;
            text += `   *Contoh:* \`.setarbakti sb_api_xxx kris\`\n\n`;
            text += `2. Atur API Key saja:\n`;
            text += `   \`.setarbakti [api_key]\`\n\n`;
            text += `3. Atur atau ganti ID Aplikasi saja:\n`;
            text += `   \`.setapp [id_aplikasi]\`\n`;
            text += `   *Contoh:* \`.setapp kris\`\n\n`;
            text += `4. Cek semua aplikasi terdaftar di akun:\n`;
            text += `   \`.cekarbakti\`\n\n`;
            text += `_Catatan: ID Aplikasi dapat dilihat di menu Pattern Notifikasi https://payment.arbakti.monster/member/pattern-notifikasi._`;
            return sock.reply(m.chat, text, m);
        }

        // Support syntax: .setarbakti app [id_aplikasi]
        if (args[0].toLowerCase() === 'app' && args[1]) {
            const chosenApp = args[1].trim();
            db.updateSettings({ arbakti_app_id: chosenApp, arbakti_method: chosenApp });
            arbakti.appId = chosenApp;
            if (!config.arbakti) config.arbakti = {};
            config.arbakti.appId = chosenApp;
            config.arbakti.method = chosenApp;

            const settingsFile = path.join(__dirname, '..', 'database', 'settings.json');
            try {
                const currentSettings = fs.existsSync(settingsFile) ? fs.readJsonSync(settingsFile) : {};
                currentSettings.arbakti_app_id = chosenApp;
                currentSettings.arbakti_method = chosenApp;
                fs.writeJsonSync(settingsFile, currentSettings, { spaces: 2 });
            } catch {}

            return sock.reply(m.chat, `✅ *ID Aplikasi Arbakti Diperbarui!*\n\nID Aplikasi yang digunakan: *${chosenApp}*`, m);
        }

        const apiKey = args[0].trim();
        const customAppId = args[1] ? args[1].trim() : '';

        // 1. Simpan ke database / settings
        const updatePayload = { arbakti_api_key: apiKey };
        if (customAppId) {
            updatePayload.arbakti_app_id = customAppId;
            updatePayload.arbakti_method = customAppId;
        }
        db.updateSettings(updatePayload);

        // 2. Simpan ke database/settings.json
        const settingsFile = path.join(__dirname, '..', 'database', 'settings.json');
        try {
            const currentSettings = fs.existsSync(settingsFile) ? fs.readJsonSync(settingsFile) : {};
            currentSettings.arbakti_api_key = apiKey;
            if (customAppId) {
                currentSettings.arbakti_app_id = customAppId;
                currentSettings.arbakti_method = customAppId;
            }
            fs.writeJsonSync(settingsFile, currentSettings, { spaces: 2 });
        } catch (e) {
            console.error('[ SETARBAKTI ] Gagal simpan ke settings.json:', e.message);
        }

        // 3. Update runtime client
        arbakti.apiKey = apiKey;
        if (customAppId) {
            arbakti.appId = customAppId;
        }
        if (!config.arbakti) config.arbakti = {};
        config.arbakti.apiKey = apiKey;
        if (customAppId) {
            config.arbakti.appId = customAppId;
            config.arbakti.method = customAppId;
        }

        await sock.reply(m.chat, `⏳ Memvalidasi API Key & memeriksa ID Aplikasi ke server Arbakti...`, m);

        // 4. Test API Key ke endpoint /payment/list
        const testRes = await arbakti.getPaymentList(true);
        const masked = apiKey.length > 7
            ? (apiKey.slice(0, 4) + '****' + apiKey.slice(-4))
            : '****';

        if (!testRes.success || !testRes.data) {
            let warnMsg = `⚠️ *API KEY TERSIMPAN TETAPI GAGAL VALIDASI*\n\n`;
            warnMsg += `• API Key   : *${masked}*\n`;
            warnMsg += `• Keterangan: ${testRes.message || 'Gagal menghubungi Arbakti'}\n\n`;
            warnMsg += `_Pastikan API Key benar dan diambil dari menu Profil di https://payment.arbakti.monster._`;
            return sock.reply(m.chat, warnMsg, m);
        }

        const qrisList = Array.isArray(testRes.data.QRIS) ? testRes.data.QRIS : (testRes.data.QRIS ? [testRes.data.QRIS] : []);

        // Jika user tidak memasukkan customAppId, coba deteksi otomatis
        let selectedApp = customAppId || arbakti.appId;
        if (!selectedApp && qrisList.length > 0) {
            const autoMatch = qrisList.find(q => {
                const s = (q.id + ' ' + (q.name || '')).toLowerCase();
                return s.includes('kris') || s.includes('fenbot');
            });
            if (autoMatch) {
                selectedApp = autoMatch.id;
            } else {
                selectedApp = qrisList[0].id;
            }
            // Simpan yang terpilih
            db.updateSettings({ arbakti_app_id: selectedApp, arbakti_method: selectedApp });
            arbakti.appId = selectedApp;
        }

        let replyText = `✅ *PENGATURAN ARBAKTI BERHASIL DISIMPAN!*\n\n`;
        replyText += `• API Key      : *${masked}*\n`;
        replyText += `• ID Aplikasi  : *${selectedApp || '(Belum dipilih)'}*\n`;
        replyText += `• Gateway      : *https://payment.arbakti.monster*\n\n`;

        if (qrisList.length > 0) {
            replyText += `📱 *Daftar Aplikasi QRIS di Akun Anda:*\n`;
            qrisList.forEach((q, idx) => {
                const isSelected = q.id === selectedApp;
                replyText += `  ${idx + 1}. *${q.name || q.id}* (ID: \`${q.id}\`)${isSelected ? ' 👈 *Aktif*' : ''}\n`;
            });
            replyText += `\n💡 _Untuk mengganti ID Aplikasi yang digunakan bot ini, ketik:_\n`;
            replyText += `\`.setapp [id_aplikasi]\` (contoh: \`.setapp kris\`)\n\n`;
            replyText += `Layanan QRIS otomatis (*.deposit* dan *.buyqris*) kini siap digunakan! 🚀`;
        } else {
            replyText += `⚠️ *PERHATIAN PENTING:*\n`;
            replyText += `API Key valid dan terhubung, tetapi *BELUM ADA ID Aplikasi QRIS yang aktif* di akun Arbakti Anda!\n\n`;
            replyText += `👉 *Cara membuat/mengaktifkan ID Aplikasi di Arbakti:*\n`;
            replyText += `1. Buka *https://payment.arbakti.monster/member/pattern-notifikasi*\n`;
            replyText += `2. Buat ID Aplikasi (misal: \`kris\`)\n`;
            replyText += `3. Pasang di bot ini dengan mengetik: \`.setapp kris\``;
        }

        await sock.reply(m.chat, replyText, m);
    }
};
