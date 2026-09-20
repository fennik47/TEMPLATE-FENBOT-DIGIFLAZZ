const fs = require('fs-extra');
const path = require('path');

module.exports = {
    name: "addrek",
    run: async (sock, m, { args, text, isOwner }) => {
        if (!isOwner) return sock.reply(m.chat, 'Hanya Owner yang bisa menambah rekening!', m);
        if (!text) return sock.reply(m.chat, 'Format: .addrek [nomor] [bank] [nama]\nContoh: .addrek 085797195435 DANA Kherul Anam', m);

        const dbPath = path.join(__dirname, '..', 'config', 'payment.json');
        const db = await fs.readJson(dbPath);

        const [nomor, bank, ...namaArr] = args;
        const nama = namaArr.join(' ');

        if (!nomor || !bank || !nama) return sock.reply(m.chat, 'Format salah! Contoh: .addrek 085797195435 DANA Kherul Anam', m);

        db.rekening.push({ nomor, bank, nama });
        await fs.writeJson(dbPath, db, { spaces: 2 });

        await sock.reply(m.chat, `Berhasil menambah rekening:\nBank: ${bank}\nNomor: ${nomor}\nNama: ${nama}`, m);
    }
};
