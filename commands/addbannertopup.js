const fs = require('fs-extra');
const path = require('path');
const db = require('../lib/db');

module.exports = {
    name: "addbannertopup",
    aliases: ["setbannertopup", "addbannertop"],
    run: async (sock, m, { text, isOwner }) => {
        if (!isOwner) return sock.reply(m.chat, 'Hanya Owner yang bisa mengatur banner topup!', m);

        const q = m.quoted ? m.quoted : m;
        const isImage = q.type === 'imageMessage';

        try {
            if (isImage) {
                const buffer = await q.download();
                const thumbDir = path.join(__dirname, '..', 'database');
                const filePath = path.join(thumbDir, 'topup_thumbnail.png');

                await fs.ensureDir(thumbDir);
                await fs.writeFile(filePath, buffer);

                db.updateSettings({ topupThumbnailUrl: filePath });
                await sock.reply(m.chat, '✅ Berhasil memperbarui banner topup dari gambar.', m);
            } else if (text && text.startsWith('http')) {
                db.updateSettings({ topupThumbnailUrl: text });
                await sock.reply(m.chat, '✅ Berhasil memperbarui banner topup dari URL.', m);
            } else {
                await sock.reply(m.chat, '❌ Kirim/Reply gambar dengan caption .addbannertopup atau masukkan URL gambar.', m);
            }
        } catch (err) {
            console.error(err);
            await sock.reply(m.chat, `❌ Gagal menyimpan banner topup: ${err.message}`, m);
        }
    }
};
