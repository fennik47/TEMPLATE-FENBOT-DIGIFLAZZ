const db = require('../lib/db');
const mustikapay = require('../lib/mustikapay');
const lidHelper = require('../lib/lidHelper');

module.exports = {
    name: "cekstatus",
    aliases: ["statusdepo", "checkdepo", "statusqris"],
    run: async (sock, m, { args, isOwner: callerIsOwner, config }) => {
        const jid = lidHelper.toJid(m.sender);
        const refNo = (args[0] || '').trim();

        if (!refNo) {
            return sock.reply(m.chat, `🔍 *Format Pengecekan Status Transaksi QRIS:*\n\n` +
                `Ketik: *.cekstatus [REF_NO]*\n` +
                `Contoh: \`.cekstatus MP12345678\`\n\n` +
                `_Kode Ref ID tercantum pada struk tagihan QRIS Anda._`, m);
        }

        const isOwner = callerIsOwner !== undefined ? callerIsOwner : config.owner.some(v => lidHelper.toJid(v) === jid);

        // 0. Cek apakah ini transaksi pembelian produk via saldo bot (Digiflazz topup)
        const allTransactions = db.readDB().transactions || {};
        const trx = allTransactions[refNo] || Object.values(allTransactions).find(t => t.id === refNo || t.id.toLowerCase() === refNo.toLowerCase());
        if (trx) {
            const trxOwner = lidHelper.toJid(trx.user);
            if (trxOwner !== jid && !isOwner) {
                return sock.reply(m.chat, `🚫 Anda tidak memiliki akses untuk memeriksa transaksi ini.`, m);
            }

            let statusIcon = '⏳';
            let statusText = 'SEDANG DIPROSES (PENDING)';
            if (trx.status === 'success' || trx.status === 'sukses') {
                statusIcon = '✅';
                statusText = 'BERHASIL (SUKSES)';
            } else if (trx.status === 'failed' || trx.status === 'gagal') {
                statusIcon = '❌';
                statusText = 'GAGAL (REFUND SALDO)';
            }

            let msg = `${statusIcon} *STATUS TRANSAKSI DIGIFLAZZ*\n\n`;
            msg += `• Order ID : *${trx.id}*\n`;
            msg += `• Produk   : *${trx.product_name || trx.sku}*\n`;
            msg += `• Tujuan   : *${trx.target}*\n`;
            msg += `• Harga    : Rp${Number(trx.price).toLocaleString()}\n`;
            msg += `• Status   : *${statusText}*\n`;
            if (trx.sn) msg += `• SN / Ref : *${trx.sn}*\n`;
            if (trx.note) msg += `• Catatan  : ${trx.note}\n`;
            msg += `• Waktu    : ${trx.time || '-'}\n`;

            return sock.reply(m.chat, msg, m);
        }

        // 1. Cek apakah ini transaksi pembelian produk langsung (qris_orders)
        const qrisOrder = db.getQrisOrder(refNo);
        if (qrisOrder) {
            const ordOwner = lidHelper.toJid(qrisOrder.user);
            if (ordOwner !== jid && !isOwner) {
                return sock.reply(m.chat, `🚫 Anda tidak memiliki akses untuk memeriksa tagihan ini.`, m);
            }

            if (qrisOrder.status === 'success' || qrisOrder.status === 'sukses') {
                return sock.reply(m.chat, `✅ *STATUS: BERHASIL (SUKSES)*\n\n` +
                    `• Order ID : *${qrisOrder.id}*\n` +
                    `• Ref ID   : *${qrisOrder.ref_no}*\n` +
                    `• Produk   : *${qrisOrder.product_name}*\n` +
                    `• Tujuan   : *${qrisOrder.target}*\n` +
                    `• Status   : ✅ SUKSES\n` +
                    `• SN / Ref : ${qrisOrder.sn || '-'}\n\n` +
                    `_Pesanan telah berhasil terkirim ke nomor tujuan._`, m);
            }

            if (qrisOrder.status === 'process') {
                return sock.reply(m.chat, `⏳ *STATUS: SEDANG DIPROSES (PROCESS)*\n\n` +
                    `• Order ID : *${qrisOrder.id}*\n` +
                    `• Ref ID   : *${qrisOrder.ref_no}*\n` +
                    `• Produk   : *${qrisOrder.product_name}*\n` +
                    `• Tujuan   : *${qrisOrder.target}*\n` +
                    `• Status   : ⏳ SEDANG DIPROSES KE PROVIDER\n\n` +
                    `_Pembayaran QRIS telah diterima, pulsa/game sedang dikirim oleh provider._`, m);
            }

            if (qrisOrder.status === 'failed') {
                return sock.reply(m.chat, `⚠️ *STATUS: GAGAL (DANA DI-REFUND)*\n\n` +
                    `• Order ID : *${qrisOrder.id}*\n` +
                    `• Produk   : *${qrisOrder.product_name}*\n` +
                    `• Alasan   : ${qrisOrder.note || 'Gangguan provider'}\n` +
                    `• Status   : ❌ GAGAL (Dana dikembalikan ke Saldo Bot)\n\n` +
                    `_Saldo Anda telah dikembalikan secara otomatis ke Saldo Bot._`, m);
            }

            if (qrisOrder.status === 'expired') {
                return sock.reply(m.chat, `⏰ *STATUS: KADALUARSA (EXPIRED)*\n\n` +
                    `• Order ID : *${qrisOrder.id}*\n` +
                    `• Status   : ❌ EXPIRED (Masa berlaku 15 menit habis)\n\n` +
                    `_Silakan lakukan pemesanan ulang via *.buyqris*._`, m);
            }

            // Jika status masih pending, cek real-time ke API MustikaPay
            await sock.reply(m.chat, `⏳ Memeriksa status pembayaran QRIS ke gateway MustikaPay...`, m);
            try {
                const checkRes = await mustikapay.checkQrisStatus(qrisOrder.ref_no || refNo);
                const s = (checkRes.status || '').toLowerCase();
                if (s === 'success' || s === 'paid' || s === 'settlement') {
                    // Trigger manual processing
                    return sock.reply(m.chat, `✅ *Pembayaran Terdeteksi!*\nPesanan Anda telah masuk antrean proses pengiriman ke provider...`, m);
                } else if (s === 'expired') {
                    db.updateQrisOrder(qrisOrder.ref_no || refNo, { status: 'expired' });
                    return sock.reply(m.chat, `⏰ Tagihan QRIS ini telah kadaluarsa (*EXPIRED*).`, m);
                } else {
                    return sock.reply(m.chat, `⏳ *STATUS: BELUM DIBAYAR (PENDING)*\n\n` +
                        `• Order ID : *${qrisOrder.id}*\n` +
                        `• Total    : *Rp${Number(qrisOrder.price).toLocaleString()}*\n` +
                        `• Status   : ⏳ Menunggu Pembayaran\n\n` +
                        `_Silakan scan QRIS untuk menyelesaikan pembayaran._`, m);
                }
            } catch (err) {
                return sock.reply(m.chat, `⚠️ Gagal memeriksa status: ${err.message}`, m);
            }
        }

        // 2. Cek apakah ini transaksi deposit saldo biasa (deposits)
        const deposit = db.getDeposit(refNo);
        if (deposit) {
            const depOwner = lidHelper.toJid(deposit.user);
            if (depOwner !== jid && !isOwner) {
                return sock.reply(m.chat, `🚫 Anda tidak memiliki akses untuk memeriksa tagihan ini.`, m);
            }

            if (deposit.status === 'paid' || deposit.status === 'success') {
                return sock.reply(m.chat, `✅ *STATUS: SUDAH DIBAYAR (PAID)*\n\n` +
                    `• Ref ID   : *${deposit.ref_no || deposit.id}*\n` +
                    `• Nominal  : *Rp${Number(deposit.amount).toLocaleString()}*\n` +
                    `• Status   : ✅ SUKSES / LUNAS\n` +
                    `• Waktu    : ${deposit.paidAt || deposit.updatedAt || deposit.createdAt}\n\n` +
                    `_Saldo telah berhasil dikreditkan ke akun Anda._`, m);
            }

            if (deposit.status === 'expired') {
                return sock.reply(m.chat, `⏰ *STATUS: KADALUARSA (EXPIRED)*\n\n` +
                    `• Ref ID   : *${deposit.ref_no || deposit.id}*\n` +
                    `• Nominal  : *Rp${Number(deposit.amount).toLocaleString()}*\n` +
                    `• Status   : ❌ EXPIRED\n\n` +
                    `_Batas waktu pembayaran telah habis. Silakan buat tagihan baru dengan mengetik *.deposit [nominal]*._`, m);
            }

            if (deposit.status === 'failed') {
                return sock.reply(m.chat, `❌ *STATUS: GAGAL (FAILED)*\n\n` +
                    `• Ref ID   : *${deposit.ref_no || deposit.id}*\n` +
                    `• Nominal  : *Rp${Number(deposit.amount).toLocaleString()}*\n` +
                    `• Status   : ❌ GAGAL\n` +
                    `• Catatan  : ${deposit.note || 'Transaksi dibatalkan'}\n\n` +
                    `_Silakan hubungi admin jika terdapat kendala._`, m);
            }

            // Jika status masih pending, cek real-time ke API MustikaPay
            await sock.reply(m.chat, `⏳ Memeriksa status pembayaran ke gateway MustikaPay...`, m);

            try {
                const checkRes = await mustikapay.checkQrisStatus(deposit.ref_no || refNo);
                const statusLower = (checkRes.status || '').toLowerCase();

                if (statusLower === 'success' || statusLower === 'paid' || statusLower === 'settlement') {
                    if (deposit.status !== 'paid' && !deposit.isProcessing) {
                        deposit.isProcessing = true;
                        try {
                            const idempotencyKey = `dep_credit_${deposit.id || deposit.ref_no}`;
                            await db.creditBalance(deposit.user, deposit.amount, idempotencyKey);
                            db.updateDeposit(deposit.ref_no || deposit.id, {
                                status: 'paid',
                                paidAt: new Date().toISOString(),
                                isProcessing: false
                            });

                            const updatedUser = await db.getUserAsync(deposit.user);

                            let successMsg = `🎉 *PEMBAYARAN DITERIMA (VERIFIKASI MANUAL SUKSES)* 🎉\n\n`;
                            successMsg += `• Ref ID    : *${deposit.ref_no || deposit.id}*\n`;
                            successMsg += `• Nominal   : *Rp${Number(deposit.amount).toLocaleString()}*\n`;
                            successMsg += `• Status    : ✅ *PAID / SUKSES*\n`;
                            successMsg += `• Total Saldo: *Rp${(updatedUser.balance || 0).toLocaleString()}*\n\n`;
                            successMsg += `_Terima kasih! Saldo telah masuk ke dompet akun Anda._`;

                            await sock.reply(m.chat, successMsg, m);
                            return;
                        } catch (creditErr) {
                            deposit.isProcessing = false;
                            console.error('[ CREDIT BALANCE ERROR ]', creditErr.message);
                            return sock.reply(m.chat, `⚠️ Pembayaran terkonfirmasi tetapi terjadi kendala saat mengkreditkan saldo: ${creditErr.message}. Harap hubungi admin.`, m);
                        }
                    } else {
                        return sock.reply(m.chat, `✅ Transaksi ini sudah berhasil diproses sebelumnya.`, m);
                    }
                } else if (statusLower === 'expired') {
                    db.updateDeposit(deposit.ref_no || deposit.id, { status: 'expired' });
                    return sock.reply(m.chat, `⏰ Tagihan ini telah kadaluarsa (*EXPIRED*). Silakan buat transaksi baru via *.deposit*.`, m);
                } else {
                    return sock.reply(m.chat, `⏳ *STATUS: BELUM DIBAYAR (PENDING)*\n\n` +
                        `• Ref ID   : *${deposit.ref_no || deposit.id}*\n` +
                        `• Nominal  : *Rp${Number(deposit.amount).toLocaleString()}*\n` +
                        `• Status   : ⏳ *Menunggu Pembayaran*\n\n` +
                        `_Sistem belum mendeteksi pembayaran masuk. Harap selesaikan pembayaran melalui scan QRIS Anda._`, m);
                }
            } catch (err) {
                return sock.reply(m.chat, `⚠️ Gagal memeriksa status ke gateway: ${err.message}`, m);
            }
        }

        return sock.reply(m.chat, `❌ Tagihan atau pesanan dengan Ref ID *${refNo}* tidak ditemukan di sistem.`, m);
    }
};
