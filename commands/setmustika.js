const fs = require('fs-extra');
const path = require('path');
const db = require('../lib/db');
const mustikapay = require('../lib/mustikapay');

module.exports = {
    name: "setmustika",
    aliases: ["setmustikapay", "setqris"],
    run: async (sock, m, { args, isOwner, config }) => {
        if (!isOwner) return sock.reply(m.chat, "❌ Perintah ini khusus untuk Owner bot!", m);

        if (!args || args.length < 2) {
            const currentUsername = mustikapay.username || "(belum diatur)";
            const rawKey = mustikapay.apiKey || "";
            const currentKey = rawKey.length > 7
                ? (rawKey.slice(0, 4) + '****' + rawKey.slice(-3))
                : (rawKey ? '****' : '(belum diatur)');

            let text = `⚙️ *PENGATURAN MUSTIKAPAY (QRIS OTOMATIS)*\n\n`;
            text += `• Username: *${currentUsername}*\n`;
            text += `• API Key : *${currentKey}*\n\n`;
            text += `💡 *Cara Pengisian:*\n`;
            text += `\`.setmustika [username] [api_key]\`\n\n`;
            text += `*Contoh:*\n`;
            text += `\`.setmustika merchant123 MP-9876543210\`\n\n`;
            text += `_Catatan: Anda juga bisa mengisi Username dan API Key langsung melalui menu Konfigurasi di Web Panel FENBOT Cloud._`;
            return sock.reply(m.chat, text, m);
        }

        const username = args[0].trim();
        const apiKey = args[1].trim();

        // 1. Simpan ke cache memory database
        db.updateSettings({
            mustikapay_username: username,
            mustikapay_api_key: apiKey
        });

        // 2. Persist ke database/settings.json
        const settingsFile = path.join(__dirname, '..', 'database', 'settings.json');
        try {
            const currentSettings = fs.existsSync(settingsFile) ? fs.readJsonSync(settingsFile) : {};
            currentSettings.mustikapay_username = username;
            currentSettings.mustikapay_api_key = apiKey;
            fs.writeJsonSync(settingsFile, currentSettings, { spaces: 2 });
        } catch (e) {
            console.error('[ SETMUSTIKA ] Gagal simpan ke settings.json:', e.message);
        }

        // 3. Update runtime client
        mustikapay.username = username;
        mustikapay.apiKey = apiKey;
        if (!config.mustikapay) config.mustikapay = {};
        config.mustikapay.username = username;
        config.mustikapay.apiKey = apiKey;

        const masked = apiKey.length > 7
            ? (apiKey.slice(0, 4) + '****' + apiKey.slice(-3))
            : '****';

        let replyText = `✅ *KREDENSIAL MUSTIKAPAY BERHASIL DISIMPAN!*\n\n`;
        replyText += `• Username: *${username}*\n`;
        replyText += `• API Key : *${masked}*\n\n`;
        replyText += `Layanan QRIS otomatis (*.deposit* dan *.buyqris*) kini telah aktif dan siap digunakan! 🚀`;

        await sock.reply(m.chat, replyText, m);
    }
};
