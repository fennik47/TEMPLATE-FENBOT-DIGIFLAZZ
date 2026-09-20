const db = require('../lib/db');
const lidHelper = require('../lib/lidHelper');

module.exports = {
    name: "daftar",
    aliases: ["register"],
    run: async (sock, m, { text }) => {
        const userId = lidHelper.toJid(m.sender);
        const user = db.getUser(userId);
        
        if (user.registered) {
            return sock.reply(m.chat, '❌ Anda sudah terdaftar sebelumnya.', m);
        }

        if (!text) {
            return sock.reply(m.chat, '❌ Harap masukkan nama Anda.\nContoh: *.daftar Budi*', m);
        }

        const phoneDigits = userId.split('@')[0];
        db.updateUser(userId, { 
            name: text.trim(), 
            nomor: phoneDigits,
            registered: true,
            registeredAt: new Date().toISOString()
        });

        const successMsg = `✅ *PENDAFTARAN BERHASIL*\n\n` +
            `• Nama: ${text.trim()}\n` +
            `• Nomor: ${phoneDigits}\n` +
            `• Role: BRONZE\n\n` +
            `Sekarang Anda dapat menggunakan semua fitur bot. Ketik *.menu* untuk memulai.`;

        await sock.reply(m.chat, successMsg, m);
    }
};
