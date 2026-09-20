const digiflazz = require('../lib/digiflazz');
const db = require('../lib/db');

module.exports = {
    name: "updateprice",
    aliases: ["up"],
    run: async (sock, m, { isOwner }) => {
        if (!isOwner) return sock.reply(m.chat, 'Hanya Owner yang bisa update harga!', m);
        
        await sock.reply(m.chat, '⏳ Sedang mengambil data pricelist dari Digiflazz...', m);
        
        try {
            const products = await digiflazz.getPriceList();
            
            if (!Array.isArray(products)) {
                // If it's not an array, it's an error object from Digiflazz
                return sock.reply(m.chat, `❌ Gagal update pricelist.\nRespon API: ${JSON.stringify(products)}`, m);
            }
            
            db.updateProducts(products);
            
            await sock.reply(m.chat, `✅ Berhasil update pricelist!\nTotal Produk: ${products.length}`, m);
        } catch (err) {
            sock.reply(m.chat, `❌ Gagal update pricelist.\nError: ${err.message}`, m);
        }
    }
};
