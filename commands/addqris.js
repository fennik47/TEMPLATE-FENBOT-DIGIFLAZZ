const fs = require('fs-extra');
const path = require('path');

module.exports = {
    name: "addqris",
    run: async (sock, m, { isOwner }) => {
        if (!isOwner) return sock.reply(m.chat, 'Hanya Owner yang bisa menambah QRIS!', m);
        
        const q = m.quoted ? m.quoted : m;
        if (q.type !== 'imageMessage') return sock.reply(m.chat, '❌ Reply gambar QRIS dengan caption .addqris', m);

        try {
            const dbPath = path.join(__dirname, '..', 'config', 'payment.json');
            const paymentDb = await fs.readJson(dbPath);

            const buffer = await q.download();
            const qrisDir = path.join(__dirname, '..', 'database');
            const filePath = path.join(qrisDir, 'qris.png');
            
            await fs.ensureDir(qrisDir);
            await fs.writeFile(filePath, buffer);

            paymentDb.qris = filePath;
            await fs.writeJson(dbPath, paymentDb, { spaces: 2 });

            await sock.reply(m.chat, '✅ Berhasil memperbarui QRIS dan tersimpan secara lokal.', m);
        } catch (err) {
            console.error(err);
            await sock.reply(m.chat, `❌ Gagal menyimpan QRIS: ${err.message}`, m);
        }
    }
};
