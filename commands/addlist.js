const db = require('../lib/db');

module.exports = {
    name: "addlist",
    aliases: ["tambahproduk"],
    run: async (sock, m, { args, text, isOwner }) => {
        if (!isOwner) return sock.reply(m.chat, "❌ Khusus Owner!", m);

        const parts = text.split("|").map(t => t.trim());
        let name, modal, jual;

        if (parts.length === 3) {
            // Format: Nama | Modal | Jual
            [name, modal, jual] = parts;
        } else if (parts.length === 2) {
            // Format: Nama | Jual (Modal default 0)
            [name, jual] = parts;
            modal = "0";
        } else {
            return sock.reply(m.chat, "❌ Format salah!\n\n• Contoh 1: `.addlist Nama | Harga` (Tanpa modal)\n• Contoh 2: `.addlist Nama | Modal | Harga` (Dengan modal)", m);
        }

        if (!name || !jual) {
            return sock.reply(m.chat, "❌ Pastikan Nama dan Harga Jual terisi!", m);
        }

        db.addManualProduct({
            name,
            modal: parseInt(modal.replace(/[^0-9]/g, '')) || 0,
            price: parseInt(jual.replace(/[^0-9]/g, ''))
        });

        await sock.reply(m.chat, `✅ Produk *${name}* berhasil ditambahkan.\n• Harga Jual: Rp${parseInt(jual).toLocaleString()}\n• Modal: Rp${parseInt(modal).toLocaleString()}`, m);
    }
};
