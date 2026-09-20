const fs = require('fs-extra');
const path = require('path');

module.exports = {
    name: "delrek",
    run: async (sock, m, { args, isOwner }) => {
        if (!isOwner) return sock.reply(m.chat, 'Hanya Owner yang bisa menghapus rekening!', m);
        if (!args[0]) return sock.reply(m.chat, 'Masukkan nomor rekening yang ingin dihapus!', m);

        const dbPath = path.join(__dirname, '..', 'config', 'payment.json');
        const db = await fs.readJson(dbPath);

        const initialLength = db.rekening.length;
        db.rekening = db.rekening.filter(r => r.nomor !== args[0]);

        if (db.rekening.length === initialLength) {
            return sock.reply(m.chat, 'Nomor rekening tidak ditemukan.', m);
        }

        await fs.writeJson(dbPath, db, { spaces: 2 });
        await sock.reply(m.chat, `Berhasil menghapus rekening dengan nomor: ${args[0]}`, m);
    }
};
