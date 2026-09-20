const db = require('../lib/db');

module.exports = {
    name: "dellist",
    aliases: ["hapusproduk"],
    run: async (sock, m, { text, isOwner }) => {
        if (!isOwner) return sock.reply(m.chat, "❌ Khusus Owner!", m);
        if (!text) return sock.reply(m.chat, "❌ Masukkan nama produk yang ingin dihapus!", m);

        const success = db.delManualProduct(text.trim());
        
        if (success) {
            await sock.reply(m.chat, `✅ Berhasil menghapus produk *${text}* dari daftar manual.`, m);
        } else {
            await sock.reply(m.chat, `❌ Produk *${text}* tidak ditemukan di daftar manual.`, m);
        }
    }
};
