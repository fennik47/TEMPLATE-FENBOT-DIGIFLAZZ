const crypto = require('crypto');
const db = require('../lib/db');
const arbakti = require('../lib/arbakti');
const lidHelper = require('../lib/lidHelper');

module.exports = {
    name: "deposit",
    aliases: ["depoqris", "qris", "topupqris"],
    run: async (sock, m, { args }) => {
        const jid = lidHelper.toJid(m.sender);

        if (!args || args.length === 0) {
            return sock.reply(m.chat, `💡 *CARA DEPOSIT SALDO VIA QRIS OTOMATIS*\n\n` +
                `1. Ketik: *.deposit [nominal]*\n` +
                `   Contoh: \`.deposit 25000\`\n` +
                `2. Scan & bayar kode QRIS yang muncul menggunakan BCA, Mandiri, BRI, DANA, GoPay, OVO, ShopeePay, dll.\n` +
                `3. Saldo Anda akan *langsung masuk otomatis* dalam hitungan detik setelah dibayar! ⚡\n\n` +
                `_Catatan: Minimal deposit Rp1.000._\n` +
                `_Untuk deposit transfer manual via bank/e-wallet admin, gunakan: *.depomanual [nominal]*_`, m);
        }

        const amount = parseInt(args[0].replace(/[^0-9]/g, ''));
        if (isNaN(amount) || amount < 1000) {
            return sock.reply(m.chat, "❌ Nominal deposit minimal Rp1.000!", m);
        }

        // Cek apakah user masih memiliki tagihan QRIS yang belum selesai
        if (db.hasPendingDeposit(jid)) {
            const pendingList = db.getPendingDeposits().filter(d => {
                const depJid = lidHelper.toJid(d.user) || d.user;
                return depJid === jid;
            });
            const activeDep = pendingList[0];
            if (activeDep) {
                return sock.reply(m.chat, `⚠️ *TAGIHAN PENDING TERDETEKSI*\n\n` +
                    `Anda masih memiliki tagihan deposit yang belum diselesaikan:\n` +
                    `• Ref No   : *${activeDep.ref_no || activeDep.id}*\n` +
                    `• Nominal  : *Rp${Number(activeDep.amount).toLocaleString()}*\n` +
                    `• Status   : ⏳ *Menunggu Pembayaran*\n\n` +
                    `Silakan selesaikan pembayaran tagihan di atas atau tunggu hingga masa aktif habis (15 menit).\n` +
                    `Ketik *.cekstatus ${activeDep.ref_no || activeDep.id}* untuk memeriksa status.`, m);
            }
        }

        // Cek ketersediaan API Key Arbakti
        if (!arbakti.apiKey) {
            return sock.reply(m.chat, `⚠️ *LAYANAN QRIS OTOMATIS BELUM AKTIF*\n\n` +
                `Layanan pembayaran QRIS otomatis (Arbakti) belum dikonfigurasi oleh Admin.\n` +
                `Admin harus memasukkan *API Key* Arbakti melalui:\n` +
                `• Dashboard FENBOT Cloud pada menu Pengaturan, atau\n` +
                `• Perintah WhatsApp Owner: \`.setarbakti [api_key]\`\n\n` +
                `💳 *Gunakan Deposit Manual:*\n` +
                `Silakan gunakan transfer manual ke rekening / e-wallet Admin dengan mengetik:\n` +
                `👉 *.depomanual ${amount}*\n\n` +
                `Setelah transfer, kirimkan bukti struk dengan mengetik:\n` +
                `👉 *.konfirmasi ${amount}*`, m);
        }

        await sock.reply(m.chat, `⏳ Sedang membuat tagihan QRIS untuk nominal *Rp${amount.toLocaleString()}*...`, m);

        try {
            const qrisRes = await arbakti.createQris(amount, {
                paymentMethod: 'qrisgopay'
            });

            if (qrisRes.status === 'success' || qrisRes.status === 'pending' || qrisRes.qr_url || qrisRes.qr_base64) {
                const refNo = qrisRes.transactionId || qrisRes.ref_no || `TRX${Date.now()}`;
                const depositId = `DEP${Date.now()}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
                const expiresAt = qrisRes.expiredAt ? new Date(qrisRes.expiredAt).getTime() : (Date.now() + 15 * 60 * 1000);
                const finalAmount = Number(qrisRes.amount) || amount;

                // Simpan data deposit ke database secara atomic
                db.addDeposit({
                    id: depositId,
                    ref_no: refNo,
                    user: jid,
                    amount: amount,
                    total_amount: finalAmount,
                    qr_url: qrisRes.qr_url || '',
                    qr_base64: qrisRes.qr_base64 || '',
                    payment_url: qrisRes.paymentUrl || '',
                    status: 'pending',
                    createdAt: new Date().toISOString(),
                    expiresAt: new Date(expiresAt).toISOString(),
                    chat: m.chat
                });

                let caption = `🧾 *TAGIHAN DEPOSIT QRIS OTOMATIS*\n\n`;
                caption += `• Ref ID    : *${refNo}*\n`;
                caption += `• Total     : *Rp${finalAmount.toLocaleString()}*\n`;
                caption += `• Status    : ⏳ *PENDING (Menunggu Pembayaran)*\n`;
                caption += `• Berlaku   : *15 Menit*\n\n`;
                caption += `📲 *CARA PEMBAYARAN:*\n`;
                caption += `1. Buka aplikasi M-Banking atau E-Wallet (BCA, Mandiri, BRI, BNI, DANA, GoPay, OVO, ShopeePay, LinkAja).\n`;
                caption += `2. Scan kode QR di atas.\n`;
                caption += `3. Pastikan nominal pembayaran sesuai (*Rp${finalAmount.toLocaleString()}*).\n`;
                caption += `4. Setelah sukses dibayar, *saldo akan langsung bertambah otomatis* tanpa perlu konfirmasi manual! 🚀\n\n`;
                caption += `_Jika saldo belum masuk dalam 1 menit setelah bayar, ketik:_\n`;
                caption += `\`.cekstatus ${refNo}\``;

                if (qrisRes.paymentUrl) {
                    caption += `\n\n🔗 *Link Pembayaran:* ${qrisRes.paymentUrl}`;
                }

                // Kirim gambar QRIS (prioritaskan Buffer Base64, fallback URL)
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
                        console.error('[ ARBAKTI QRIS ] Gagal kirim gambar QR, mengirim teks:', imgErr.message);
                    }
                }

                await sock.reply(m.chat, caption, m);
                return;
            } else {
                console.error('[ ARBAKTI ERROR ] Response bukan success:', qrisRes);
                const errMsg = qrisRes.message || 'Layanan QRIS gateway sedang sibuk';
                await sock.reply(m.chat, `⚠️ *Gagal membuat QRIS Otomatis:*\n${errMsg}\n\nSilakan pastikan *API Key* Arbakti sudah benar di pengaturan atau gunakan deposit transfer manual:\n👉 *.depomanual ${amount}*`, m);
            }
        } catch (err) {
            console.error('[ ARBAKTI EXCEPTION ]', err.message);
            await sock.reply(m.chat, `⚠️ Layanan QRIS otomatis sedang tidak dapat diakses (${err.message}).\n\nSilakan gunakan deposit transfer manual:\n👉 *.depomanual ${amount}*`, m);
        }
    }
};
