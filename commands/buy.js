const db = require('../lib/db');
const digiflazz = require('../lib/digiflazz');
const config = require('../config/config');
const lidHelper = require('../lib/lidHelper');

module.exports = {
    name: "buy",
    aliases: ["beli", "order"],
    run: async (sock, m, { args, text }) => {
        const jid = lidHelper.toJid(m.sender);
        const sku = args[0];
        const target = args.slice(1).join(''); // Gabungkan semua argumen setelah SKU tanpa spasi (Untuk game ML yg butuh ID+Server)

        if (!sku || !target) {
            return sock.reply(m.chat, `❌ *Format Salah!*
            
*Penggunaan:* .buy [SKU] [Target]
*Contoh:* .buy ML5 12345678

Gunakan *.topup* untuk melihat daftar SKU yang tersedia.`, m);
        }

        // Anti-spam/Check for existing pending transactions or confirmation
        if (db.hasPendingTransaction(jid) || (global.pendingTopup && global.pendingTopup[jid])) {
            return sock.reply(m.chat, `❌ *TRANSAKSI PENDING TERDETEKSI*\n\nMaaf, Anda masih memiliki transaksi yang sedang diproses atau menunggu konfirmasi (*Ya/Tidak*).\n\nSilakan selesaikan konfirmasi sebelumnya atau tunggu hingga transaksi selesai (Sukses/Gagal).`, m);
        }

        const product = db.getProduct(sku);
        if (!product) {
            return sock.reply(m.chat, `❌ *Produk Tidak Ditemukan!*
            
SKU *${sku}* tidak terdaftar di database. Silakan cek daftar SKU yang benar dengan mengetik *.topup [merek]*`, m);
        }

        // Cek Status Produk
        if (product.buyer_product_status === false) {
            return sock.reply(m.chat, `❌ *Produk Tidak Tersedia!*
            
Status produk *${sku}* saat ini sedang NONAKTIF untuk akun Anda. Silakan cek pengaturan di Dashboard Digiflazz Anda.`, m);
        }

        if (product.seller_product_status === false) {
            return sock.reply(m.chat, `❌ *Produk Sedang Gangguan!*
            
Pusat (Seller) untuk produk *${sku}* sedang mengalami gangguan atau stok kosong. Mohon coba SKU lain atau tunggu beberapa saat.`, m);
        }

        const settings = db.getSettings();
        const user = db.getUser(jid);
        const markup = settings.margins[user.role] || settings.margins.BRONZE;
        const flatProfit = typeof config.profit === "number" ? config.profit : (settings.profit_markup || 0);
        const adjustedPrice = Math.ceil(product.price * (1 + markup)) + flatProfit;

        if (user.balance < adjustedPrice) {
            return sock.reply(m.chat, `Saldo tidak cukup!\nHarga: Rp${adjustedPrice.toLocaleString()}\nSaldo Anda: Rp${user.balance.toLocaleString()}\n\nSilakan topup saldo ke admin.`, m);
        }

        // Request Confirmation
        if (!global.pendingTopup) global.pendingTopup = {};
        global.pendingTopup[jid] = {
            sku,
            target,
            price: adjustedPrice,
            modal: product.price,
            product_name: product.product_name,
            balance_before: user.balance,
            timestamp: Date.now(),
            chat: m.chat
        };

        let confirmMsg = `⚠️ *KONFIRMASI PESANAN*\n\n`;
        confirmMsg += `• Produk: ${product.product_name}\n`;
        confirmMsg += `• SKU: ${sku}\n`;
        confirmMsg += `• Target: ${target}\n`;
        confirmMsg += `• Harga: *Rp${adjustedPrice.toLocaleString()}*\n`;
        confirmMsg += `• Saldo Anda: Rp${user.balance.toLocaleString()}\n\n`;
        confirmMsg += `Apakah data di atas sudah benar?\nKetik *Ya* untuk lanjut atau *Tidak* untuk batal.`;

        await sock.reply(m.chat, confirmMsg, m);
    }
};
