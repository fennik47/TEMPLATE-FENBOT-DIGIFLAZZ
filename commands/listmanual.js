const db = require('../lib/db');

module.exports = {
    name: "listmanual",
    aliases: ["lis", "listlain", "list"],
    run: async (sock, m) => {
        const products = db.getManualProducts();
        
        if (products.length === 0) {
            return sock.reply(m.chat, "❌ Belum ada produk manual yang tersedia.", m);
        }

        let txt = `📦 *DAFTAR PRODUK MANUAL*\n\n`;
        products.forEach((p, i) => {
            txt += `${i + 1}. *${p.name}*\n`;
            txt += `   └ Harga: Rp${p.price.toLocaleString()}\n`;
        });
        txt += `\n_Ketik *.buy* untuk membeli produk Digiflazz.\nUntuk produk manual silakan hubungi Owner._`;

        await sock.reply(m.chat, txt, m);
    }
};
