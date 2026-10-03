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

            let text = `⚙️ *PENGATURAN ARBAKTI (QRIS OTOMATIS)*\n\n`;
            text += `• API Key: *${currentKey}*\n`;
            text += `• Gateway : *https://payment.arbakti.monster*\n\n`;
            text += `💡 *Cara Pengisian:*\n`;
            text += `\`.setarbakti [api_key]\`\n\n`;
            text += `*Contoh:*\n`;
            text += `\`.setarbakti sb_api_abcdef1234567890abcdef1234567890\`\n\n`;
            text += `_Catatan: Dapatkan API Key di menu Profil pada dashboard https://payment.arbakti.monster._`;
            return sock.reply(m.chat, text, m);
        }

        const apiKey = args[0].trim();

        // 1. Simpan ke cache database
        db.updateSettings({
            arbakti_api_key: apiKey
        });

        // 2. Simpan ke database/settings.json
        const settingsFile = path.join(__dirname, '..', 'database', 'settings.json');
        try {
            const currentSettings = fs.existsSync(settingsFile) ? fs.readJsonSync(settingsFile) : {};
            currentSettings.arbakti_api_key = apiKey;
            fs.writeJsonSync(settingsFile, currentSettings, { spaces: 2 });
        } catch (e) {
            console.error('[ SETARBAKTI ] Gagal simpan ke settings.json:', e.message);
        }

        // 3. Update runtime client
        arbakti.apiKey = apiKey;
        if (!config.arbakti) config.arbakti = {};
        config.arbakti.apiKey = apiKey;

        const masked = apiKey.length > 7
            ? (apiKey.slice(0, 4) + '****' + apiKey.slice(-4))
            : '****';

        let replyText = `✅ *API KEY ARBAKTI BERHASIL DISIMPAN!*\n\n`;
        replyText += `• API Key: *${masked}*\n`;
        replyText += `• Status : ✅ Aktif\n\n`;
        replyText += `Layanan QRIS otomatis (*.deposit* dan *.buyqris*) kini telah menggunakan gateway *Arbakti* dan siap digunakan! 🚀`;

        await sock.reply(m.chat, replyText, m);
    }
};
