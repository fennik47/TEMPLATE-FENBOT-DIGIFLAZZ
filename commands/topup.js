const db = require('../lib/db');


module.exports = {
    name: "topup",
    aliases: ["hargatopup", "produk", "p"],
    run: async (sock, m, { args, text }) => {
        const data = db.readDB();
        const products = data.products;
        
        if (!products || products.length === 0) {
            return sock.reply(m.chat, '❌ *DATA KOSONG*\n\nData produk belum tersedia. Silakan hubungi Owner untuk melakukan `.updateprice`.', m);
        }

        const settings = db.getSettings();
        const lidHelper = require('../lib/lidHelper');
        const userId = lidHelper.toJid(m.sender);
        const user = db.getUser(userId);
        const markup = settings.margins[user.role] || settings.margins.BRONZE;

        // Jika user tidak memasukkan kata kunci, tampilkan daftar Brand yang tersedia
        if (!text) {
            const brands = [...new Set(products.map(p => p.brand))].sort();
            
            let txt = `───〔 *DAFTAR MEREK TOPUP* 〕───\n\n`;
            txt += `*CARA BELI:* .buy [SKU] [Target]\n`;
            txt += `*Contoh:* .buy ML15 12345678\n\n`;
            txt += `Silakan pilih merek di bawah ini dengan mengetik:\n`;
            txt += `*#topup [nama merek]*\n\n`;
            txt += `*Contoh:* #topup Mobile Legends\n\n`;
            
            brands.slice(0, 60).forEach((brand, i) => {
                txt += `• ${brand}\n`;
            });
            
            txt += `\n────────────────────`;

            const fs = require('fs');
            if (settings.topupThumbnailUrl) {
                let isValidUrl = settings.topupThumbnailUrl.startsWith('http');
                let isFileExists = !isValidUrl && fs.existsSync(settings.topupThumbnailUrl);

                if (isValidUrl || isFileExists) {
                    try {
                        let imagePayload = isValidUrl ? { url: settings.topupThumbnailUrl } : fs.readFileSync(settings.topupThumbnailUrl);
                        return await sock.sendMessage(m.chat, {
                            image: imagePayload,
                            caption: txt
                        }, { quoted: m });
                    } catch (err) {
                        console.error('[ TOPUP ERROR ] Gagal mengirim thumbnail:', err.message);
                    }
                } else {
                    console.error('[ TOPUP ERROR ] File thumbnail tidak ditemukan:', settings.topupThumbnailUrl);
                }
            }
            return sock.reply(m.chat, txt, m);
        }

        // Cari produk berdasarkan brand (Partial Match agar lebih fleksibel)
        const query = text.toLowerCase();
        let filtered = products.filter(p => p.brand.toLowerCase().includes(query));
        
        // Jika tidak ada partial match, coba cari yang benar-benar mirip
        if (filtered.length === 0) {
            return sock.reply(m.chat, `❌ *MEREK TIDAK DITEMUKAN*\n\nMerek "${text}" tidak tersedia.\n\n*Tips:* Ketik *.topup* saja untuk melihat daftar merek yang tersedia.`, m);
        }

        // Ambil list brand yang unik dari hasil filter
        const uniqueBrands = [...new Set(filtered.map(p => p.brand))];
        
        // Jika hasil filter mencakup lebih dari 1 brand (misal ketik 'free' dapet 'Free Fire' dan 'Free Fire Max')
        // Berikan pilihan yang lebih spesifik jika jumlah brand > 1
        if (uniqueBrands.length > 1 && !products.some(p => p.brand.toLowerCase() === query)) {
            let txt = `🔍 *HASIL PENCARIAN:* "${text}"\n\n`;
            txt += `Ditemukan beberapa merek, silakan pilih salah satu:\n\n`;
            uniqueBrands.forEach(b => {
                txt += `• *.topup ${b}*\n`;
            });
            return sock.reply(m.chat, txt, m);
        }

        // Jika sudah spesifik ke satu brand
        const targetBrand = uniqueBrands[0];
        const finalProducts = products.filter(p => p.brand === targetBrand);

        let txt = `───〔 *HARGA ${targetBrand.toUpperCase()}* 〕───\n\n`;
        txt += `*CARA BELI:* .buy [SKU] [Target]\n`;
        txt += `*Contoh:* .buy ${finalProducts[0].buyer_sku_code} 12345678\n\n`;
        txt += `👤 *Role:* ${user.role}\n`;
        txt += `📊 *Total:* ${finalProducts.length} Produk\n\n`;
        
        finalProducts.sort((a, b) => a.price - b.price).forEach(p => {
            const price = Math.ceil(p.price * (1 + markup));
            const status = p.seller_product_status ? '✅' : '❌';
            txt += `*${p.product_name}*\n`;
            txt += `└ SKU: \`${p.buyer_sku_code}\`\n`;
            txt += `└ Harga: *Rp${price.toLocaleString()}* ${status}\n\n`;
        });
        
        txt += `────────────────────`;
        
        const fs = require('fs');
        if (settings.topupThumbnailUrl) {
            let isValidUrl = settings.topupThumbnailUrl.startsWith('http');
            let isFileExists = !isValidUrl && fs.existsSync(settings.topupThumbnailUrl);

            if (isValidUrl || isFileExists) {
                try {
                    let imagePayload = isValidUrl ? { url: settings.topupThumbnailUrl } : fs.readFileSync(settings.topupThumbnailUrl);
                    await sock.sendMessage(m.chat, {
                        image: imagePayload,
                        caption: txt
                    }, { quoted: m });
                    return;
                } catch (err) {
                    console.error('[ TOPUP ERROR ] Gagal mengirim thumbnail:', err.message);
                }
            } else {
                console.error('[ TOPUP ERROR ] File thumbnail tidak ditemukan:', settings.topupThumbnailUrl);
            }
        }
        await sock.reply(m.chat, txt, m);
    }
};
