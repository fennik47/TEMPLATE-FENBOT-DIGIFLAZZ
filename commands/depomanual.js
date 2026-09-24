const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const db = require('../lib/db');
const mustikapay = require('../lib/mustikapay');
const lidHelper = require('../lib/lidHelper');

module.exports = {
    name: "deposit",
    aliases: ["depo", "isi-saldo", "qris", "topupsaldo"],
    run: async (sock, m, { args }) => {
        const jid = lidHelper.toJid(m.sender);

        if (!args || args.length === 0) {
            return sock.reply(m.chat, `💡 *CARA DEPOSIT SALDO VIA QRIS OTOMATIS*\n\n` +
                `1. Ketik: *.deposit [nominal]*\n` +
                `   Contoh: \`.deposit 25000\`\n` +
                `2. Scan & bayar QRIS yang muncul menggunakan BCA, Mandiri, BRI, DANA, GoPay, OVO, ShopeePay, dll.\n` +
                `3. Saldo Anda akan *langsung masuk otomatis* dalam hitungan detik setelah dibayar! ⚡\n\n` +
                `_Catatan: Minimal deposit Rp1.000._`, m);
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

        // Jika API Key MustikaPay tersedia, buat QRIS dinamis otomatis
        if (mustikapay.apiKey) {
            await sock.reply(m.chat, `⏳ Sedang membuat tagihan QRIS untuk nominal *Rp${amount.toLocaleString()}*...`, m);

            try {
                const qrisRes = await mustikapay.createQris(amount);

                if (qrisRes.status === 'success' || qrisRes.status === 'pending' || qrisRes.qr_url) {
                    const refNo = qrisRes.ref_no || qrisRes.reference || `MP${Date.now()}`;
                    const depositId = `DEP${Date.now()}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
                    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 menit

                    // Simpan data deposit ke database secara atomic
                    db.addDeposit({
                        id: depositId,
                        ref_no: refNo,
                        user: jid,
                        amount: amount,
                        fee: qrisRes.fee || 0,
                        total_amount: qrisRes.total_amount || amount,
                        qr_url: qrisRes.qr_url || '',
                        status: 'pending',
                        createdAt: new Date().toISOString(),
                        expiresAt: new Date(expiresAt).toISOString(),
                        chat: m.chat
                    });

                    let caption = `🧾 *TAGIHAN DEPOSIT QRIS OTOMATIS*\n\n`;
                    caption += `• Ref ID    : *${refNo}*\n`;
                    caption += `• Nominal   : *Rp${amount.toLocaleString()}*\n`;
                    caption += `• Status    : ⏳ *PENDING (Menunggu Pembayaran)*\n`;
                    caption += `• Berlaku   : *15 Menit*\n\n`;
                    caption += `📲 *CARA PEMBAYARAN:*\n`;
                    caption += `1. Buka aplikasi M-Banking atau E-Wallet (BCA, Mandiri, BRI, BNI, DANA, GoPay, OVO, ShopeePay, LinkAja).\n`;
                    caption += `2. Scan kode QR di atas.\n`;
                    caption += `3. Pastikan nominal pembayaran sesuai.\n`;
                    caption += `4. Setelah sukses dibayar, *saldo akan langsung bertambah otomatis* tanpa perlu konfirmasi manual! 🚀\n\n`;
                    caption += `_Jika saldo belum masuk dalam 1 menit setelah bayar, ketik:_\n`;
                    caption += `\`.cekstatus ${refNo}\``;

                    if (qrisRes.qr_url) {
                        try {
                            await sock.sendMessage(m.chat, {
                                image: { url: qrisRes.qr_url },
                                caption: caption
                            }, { quoted: m });
                            return;
                        } catch (imgErr) {
                            console.error('[ MUSTIKAPAY QRIS ] Gagal kirim gambar QR, mengirim tautan:', imgErr.message);
                            caption += `\n\n🔗 *Link QRIS:* ${qrisRes.qr_url}`;
                            await sock.reply(m.chat, caption, m);
                            return;
                        }
                    } else {
                        await sock.reply(m.chat, caption, m);
                        return;
                    }
                } else {
                    console.error('[ MUSTIKAPAY ERROR ] Response bukan success:', qrisRes);
                    const errMsg = qrisRes.message || 'Layanan QRIS sedang sibuk';
                    await sock.reply(m.chat, `⚠️ *Gagal membuat QRIS Otomatis:* ${errMsg}\n\nBeralih ke metode transfer manual...`, m);
                }
            } catch (err) {
                console.error('[ MUSTIKAPAY EXCEPTION ]', err.message);
                await sock.reply(m.chat, `⚠️ Layanan QRIS otomatis sedang tidak dapat diakses (${err.message}). Beralih ke metode transfer manual...`, m);
            }
        }

        // FALLBACK: Pembayaran Manual jika API Key belum disetel atau provider bermasalah
        const dbPath = path.join(__dirname, '..', 'config', 'payment.json');
        if (!fs.existsSync(dbPath)) return sock.reply(m.chat, 'Data pembayaran belum diatur oleh admin.', m);

        const dbPayment = await fs.readJson(dbPath);

        let text = `📑 *REQUEST DEPOSIT MANUAL*\n\n`;
        text += `• Nominal: *Rp${amount.toLocaleString()}*\n`;
        text += `• Status: *Menunggu Pembayaran*\n\n`;
        text += `💳 *METODE PEMBAYARAN:*\n`;

        if (dbPayment.rekening.length === 0) {
            text += `- Belum ada data rekening.\n`;
        } else {
            dbPayment.rekening.forEach((r, i) => {
                text += `- ${r.bank}: ${r.nomor} (a/n ${r.nama})\n`;
            });
        }

        text += `\n📌 *PENTING:* Setelah transfer, silakan kirim foto bukti transfer dengan caption: \`.konfirmasi ${amount}\``;

        if (dbPayment.qris && fs.existsSync(dbPayment.qris)) {
            await sock.sendMessage(m.chat, {
                image: { url: dbPayment.qris },
                caption: text
            }, { quoted: m });
        } else {
            await sock.reply(m.chat, text, m);
        }
    }
};
