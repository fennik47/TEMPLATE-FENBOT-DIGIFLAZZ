const fs = require('fs-extra');
const path = require('path');
const db = require('../lib/db');

module.exports = {
    name: "addbannermenu",
    aliases: ["setbannermenu", "setthumb", "setthumbnail"],
    run: async (sock, m, { text, isOwner }) => {
        if (!isOwner) return sock.reply(m.chat, 'Hanya Owner yang bisa mengatur banner menu!', m);

        const q = m.quoted ? m.quoted : m;
        const isImage = q.type === 'imageMessage';

        try {
            if (isImage) {
                const buffer = await q.download();
                const thumbDir = path.join(__dirname, '..', 'database');
                const filePath = path.join(thumbDir, 'thumbnail.png');
                
                await fs.ensureDir(thumbDir);
                await fs.writeFile(filePath, buffer);

                db.updateSettings({ thumbnailUrl: filePath });
                await sock.reply(m.chat, '✅ Berhasil memperbarui banner menu dari gambar.', m);
            } else if (text && text.startsWith('http')) {
                db.updateSettings({ thumbnailUrl: text });
                await sock.reply(m.chat, '✅ Berhasil memperbarui banner menu dari URL.', m);
            } else {
                await sock.reply(m.chat, '❌ Kirim/Reply gambar dengan caption .addbannermenu atau masukkan URL gambar.', m);
            }
        } catch (err) {
            console.error(err);
            await sock.reply(m.chat, `❌ Gagal menyimpan banner menu: ${err.message}`, m);
        }
    }
};
