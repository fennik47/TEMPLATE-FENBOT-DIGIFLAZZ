const db = require('../lib/db');
const lidHelper = require('../lib/lidHelper');

module.exports = {
    name: "canceltnx",
    aliases: ["canceltrx", "bataltrx", "clearpending"],
    run: async (sock, m, { args, isOwner }) => {
        if (!isOwner) return sock.reply(m.chat, 'Hanya Owner yang berhak membatalkan transaksi yang macet!', m);

        const data = db.readDB();
        const pendingTrx = Object.values(data.transactions || {}).filter(t => t.status === 'pending');

        const input = (args[0] || '').trim();

        // 1. Opsi Clear Semua Transaksi Pending (contoh: .clearpending atau .canceltnx all)
        if (input.toLowerCase() === 'all' || m.body?.toLowerCase().includes('clearpending')) {
            if (pendingTrx.length === 0) {
                return sock.reply(m.chat, 'ℹ️ Tidak ada transaksi pending yang sedang berjalan.', m);
            }

            let refundedCount = 0;
            for (const trx of pendingTrx) {
                try {
                    await db.creditBalance(trx.user, trx.price, `owner_clear_${trx.id}`);
                } catch {}
                db.updateTransaction(trx.id, {
                    status: 'failed',
                    note: 'Dibatalkan masal oleh Owner (.clearpending)'
                });
                refundedCount++;
            }

            return sock.reply(
                m.chat,
                `✅ *BERHASIL BERSIHKAN TRANSAKSI PENDING*\n\nSebanyak *${refundedCount} transaksi pending* telah dibatalkan dan saldonya dikembalikan ke akun pembeli.\n\nSistem tidak lagi mengecek transaksi tersebut.`,
                m
            );
        }

        // 2. Jika tidak ada argumen, tampilkan daftar transaksi pending saat ini
        if (!input) {
            if (pendingTrx.length === 0) {
                return sock.reply(m.chat, 'ℹ️ Saat ini tidak ada transaksi yang berstatus pending.', m);
            }

            let msg = `📋 *DAFTAR TRANSAKSI PENDING (${pendingTrx.length})*\n\n`;
            pendingTrx.forEach((t, i) => {
                const userNo = (t.user || '').split('@')[0];
                msg += `${i + 1}. *Order ID:* ${t.id}\n`;
                msg += `   • Produk: ${t.product_name || t.sku}\n`;
                msg += `   • Target: ${t.target}\n`;
                msg += `   • User: @${userNo}\n`;
                msg += `   • Harga: Rp${Number(t.price).toLocaleString()}\n`;
                msg += `   • Waktu: ${t.time || '-'}\n\n`;
            });
            msg += `💡 *Cara Batalkan Transaksi Macet:*\n`;
            msg += `▸ Batalkan salah satu: *.canceltnx [ORDER_ID]*\n`;
            msg += `▸ Batalkan semua: *.clearpending*`;

            const mentions = pendingTrx.map(t => lidHelper.toJid(t.user)).filter(Boolean);
            return sock.sendMessage(m.chat, { text: msg, mentions }, { quoted: m });
        }

        // 3. Batalkan satu transaksi tertentu berdasarkan Order ID
        const trx = data.transactions[input] || Object.values(data.transactions).find(t => t.id === input || t.id.toLowerCase() === input.toLowerCase());

        if (!trx) {
            return sock.reply(m.chat, `❌ Transaksi dengan Order ID *${input}* tidak ditemukan di database bot.`, m);
        }

        if (trx.status === 'success') {
            return sock.reply(m.chat, `⚠️ Transaksi *${input}* sudah *SUKSES* di Digiflazz (SN: ${trx.sn || '-'}), tidak dapat dibatalkan.`, m);
        }

        if (trx.status === 'failed') {
            return sock.reply(m.chat, `ℹ️ Transaksi *${input}* sudah berstatus *GAGAL* sebelumnya.`, m);
        }

        try {
            await db.creditBalance(trx.user, trx.price, `owner_cancel_${trx.id}`);
        } catch (err) {
            console.error('[ CANCEL TRX ERROR ]', err.message);
        }

        db.updateTransaction(trx.id, {
            status: 'failed',
            note: 'Dibatalkan manual oleh Owner via .canceltnx'
        });

        const targetUserJid = lidHelper.toJid(trx.user);
        let replyMsg = `✅ *TRANSAKSI BERHASIL DIBATALKAN*\n\n`;
        replyMsg += `▸ *Order ID :* ${trx.id}\n`;
        replyMsg += `▸ *Produk   :* ${trx.product_name || trx.sku}\n`;
        replyMsg += `▸ *Target   :* ${trx.target}\n`;
        replyMsg += `▸ *Refund   :* Rp${Number(trx.price).toLocaleString()} telah dikembalikan ke @${targetUserJid.split('@')[0]}\n\n`;
        replyMsg += `_Sistem telah menghentikan pemantauan status transaksi ini._`;

        return sock.sendMessage(m.chat, { text: replyMsg, mentions: [targetUserJid] }, { quoted: m });
    }
};
