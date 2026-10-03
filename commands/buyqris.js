const crypto = require('crypto');
const db = require('../lib/db');
const arbakti = require('../lib/arbakti');
const lidHelper = require('../lib/lidHelper');

module.exports = {
    name: "buyqris",
    aliases: ["beliqris", "orderqris", "qrisbuy"],
    run: async (sock, m, { args }) => {
        const jid = lidHelper.toJid(m.sender);
        const sku = args[0];
        const target = args.slice(1).join('');

        if (!sku || !target) {
            return sock.reply(m.chat, `❌ *Format Salah!*

*Penggunaan:* .buyqris [SKU] [Target]
*Contoh:* .buyqris ML5 12345678

Gunakan *.topup* untuk melihat daftar SKU produk yang tersedia.`, m);
        }

        // Cek apakah ada transaksi pending produk atau pending QRIS
        if (db.hasPendingTransaction(jid) || db.hasPendingQrisOrder(jid) || (global.pendingTopup && global.pendingTopup[jid])) {
            return sock.reply(m.chat, `❌ *TRANSAKSI PENDING TERDETEKSI*\n\nMaaf, Anda masih memiliki transaksi yang sedang diproses atau tagihan QRIS yang belum diselesaikan.\n\nSilakan selesaikan pembayaran sebelumnya atau tunggu transaksi selesai.`, m);
        }

        const product = db.getProduct(sku);
        if (!product) {
            return sock.reply(m.chat, `❌ *Produk Tidak Ditemukan!*\n\nSKU *${sku}* tidak terdaftar di database. Silakan cek daftar SKU dengan mengetik *.topup [merek]*`, m);
        }

        if (product.buyer_product_status === false) {
            return sock.reply(m.chat, `❌ *Produk Tidak Tersedia!*\n\nStatus produk *${sku}* saat ini sedang NONAKTIF di akun toko.`, m);
        }

        if (product.seller_product_status === false) {
            return sock.reply(m.chat, `❌ *Produk Sedang Gangguan!*\n\nPusat (Seller) untuk produk *${sku}* sedang mengalami gangguan atau stok habis. Silakan coba beberapa saat lagi.`, m);
        }

        if (!arbakti.apiKey) {
            return sock.reply(m.chat, `⚠️ Layanan pembayaran QRIS otomatis (Arbakti) belum dikonfigurasi lengkap oleh Admin (memerlukan API Key).\n\nSilakan gunakan metode pembelian potong saldo bot dengan mengetik:\n*.buy ${sku} ${target}*`, m);
        }

        const settings = db.getSettings();
        const user = await db.getUserAsync(jid);
        const markup = (settings.margins && typeof settings.margins[user.role] === 'number')
            ? settings.margins[user.role]
            : (settings.margins ? settings.margins.BRONZE : 0.05);
        const adjustedPrice = Math.ceil(product.price * (1 + markup));

        await sock.reply(m.chat, `⏳ Sedang membuat tagihan QRIS untuk pembelian *${product.product_name}* seharga *Rp${adjustedPrice.toLocaleString()}*...`, m);

        try {
            const qrisRes = await arbakti.createQris(adjustedPrice);

            if (qrisRes.status === 'success' || qrisRes.status === 'pending' || qrisRes.qr_url || qrisRes.qr_base64) {
                const refNo = qrisRes.transactionId || qrisRes.ref_no || `TRXQ${Date.now()}`;
                const orderId = `QTRX${Date.now()}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
                const expiresAt = qrisRes.expiredAt ? new Date(qrisRes.expiredAt).getTime() : (Date.now() + 15 * 60 * 1000);
                const finalAmount = Number(qrisRes.amount) || adjustedPrice;

                // Catat pesanan QRIS ke database
                db.addQrisOrder({
                    id: orderId,
                    ref_no: refNo,
                    user: jid,
                    sku: product.buyer_sku_code,
                    product_name: product.product_name,
                    target: target,
                    price: adjustedPrice,
                    total_amount: finalAmount,
                    modal: product.price,
                    qr_url: qrisRes.qr_url || '',
                    qr_base64: qrisRes.qr_base64 || '',
                    payment_url: qrisRes.paymentUrl || '',
                    status: 'pending',
                    type: 'direct_purchase',
                    createdAt: new Date().toISOString(),
                    expiresAt: new Date(expiresAt).toISOString(),
                    chat: m.chat
                });

                let caption = `🧾 *TAGIHAN PEMBELIAN PRODUK (QRIS OTOMATIS)*\n\n`;
                caption += `• Order ID  : *${orderId}*\n`;
                caption += `• Ref No    : *${refNo}*\n`;
                caption += `• Produk    : *${product.product_name}*\n`;
                caption += `• Tujuan    : *${target}*\n`;
                caption += `• Total Bayar: *Rp${finalAmount.toLocaleString()}*\n`;
                caption += `• Status    : ⏳ *PENDING (Menunggu Pembayaran)*\n`;
                caption += `• Batas Waktu: *15 Menit*\n\n`;
                caption += `📲 *CARA PEMBAYARAN:*\n`;
                caption += `1. Buka M-Banking atau E-Wallet (BCA, Mandiri, BRI, BNI, DANA, GoPay, OVO, ShopeePay).\n`;
                caption += `2. Scan kode QR di atas.\n`;
                caption += `3. Selesaikan pembayaran sebesar *Rp${finalAmount.toLocaleString()}*.\n`;
                caption += `4. Begitu lunas, sistem akan *langsung otomatis memproses* pesanan ke nomor tujuan Anda! 🚀\n\n`;
                caption += `_Jika telah bayar dan belum terproses dalam 1 menit, ketik:_\n`;
                caption += `\`.cekstatus ${refNo}\``;

                if (qrisRes.paymentUrl) {
                    caption += `\n\n🔗 *Link Pembayaran:* ${qrisRes.paymentUrl}`;
                }

                // Kirim gambar QRIS (prioritaskan Base64, fallback URL)
                let imagePayload = null;
                if (qrisRes.qr_base64) {
                    try {
                        const cleanBase64 = qrisRes.qr_base64.replace(/^data:image\/\w+;base64,/, '');
                        imagePayload = Buffer.from(cleanBase64, 'base64');
                    } catch {}
                }
                if (!imagePayload && qrisRes.qr_url) {
                    imagePayload = { url: qrisRes.qr_url };
                }

                if (imagePayload) {
                    try {
                        await sock.sendMessage(m.chat, {
                            image: imagePayload,
                            caption: caption
                        }, { quoted: m });
                        return;
                    } catch (imgErr) {
                        console.error('[ ARBAKTI BUYQRIS ] Gagal kirim gambar QR, mengirim teks:', imgErr.message);
                    }
                }

                await sock.reply(m.chat, caption, m);
                return;
            } else {
                const errMsg = qrisRes.message || 'Layanan QRIS sedang gangguan';
                let failReply = `❌ *Gagal membuat QRIS:*\n${errMsg}\n\n`;
                if (errMsg.toLowerCase().includes('tidak aktif') || errMsg.toLowerCase().includes('metode')) {
                    failReply += `💡 _Untuk Owner: Ketik *.cekarbakti* untuk memeriksa metode pembayaran yang aktif di akun Arbakti._\n\n`;
                }
                failReply += `Anda dapat membeli via Saldo Bot: *.buy ${sku} ${target}*`;
                await sock.reply(m.chat, failReply, m);
            }
        } catch (err) {
            console.error('[ ARBAKTI BUYQRIS ERROR ]', err.message);
            await sock.reply(m.chat, `❌ Terjadi kesalahan saat membuat QRIS: ${err.message}`, m);
        }
    }
};
