const db = require('../lib/db');
const lidHelper = require('../lib/lidHelper');

module.exports = {
    name: "accdepo",
    aliases: ["approvedepo", "accqris", "forcedepo", "terimadepo"],
    run: async (sock, m, { args, isOwner }) => {
        if (!isOwner) return sock.reply(m.chat, "❌ Perintah ini khusus untuk Owner bot!", m);

        if (!args || args.length < 1) {
            // Tampilkan daftar deposit yang sedang pending
            const pendingList = db.getPendingDeposits();
            if (pendingList.length === 0) {
                return sock.reply(m.chat, `ℹ️ Tidak ada tagihan deposit yang sedang pending saat ini.`, m);
            }

            let text = `📋 *DAFTAR DEPOSIT PENDING (${pendingList.length}):*\n\n`;
            pendingList.forEach((d, idx) => {
                const userNum = (d.user || '').split('@')[0];
                text += `${idx + 1}. *${d.ref_no || d.id}*\n`;
                text += `   • User: @${userNum}\n`;
                text += `   • Nominal: Rp${Number(d.amount).toLocaleString()}\n`;
                text += `   • Total Trf: Rp${Number(d.total_amount || d.amount).toLocaleString()}\n`;
                text += `   • Waktu: ${d.createdAt ? new Date(d.createdAt).toLocaleTimeString('id-ID') : '-'}\n\n`;
            });
            text += `💡 *Cara Menyetujui:* \`.accdepo [Ref_ID / Deposit_ID]\`\n`;
            text += `*Contoh:* \`.accdepo ${pendingList[0].ref_no || pendingList[0].id}\``;
            return sock.reply(m.chat, text, m, { mentions: pendingList.map(d => d.user).filter(Boolean) });
        }

        const query = args[0].trim();
        const pendingList = db.getPendingDeposits();
        const deposit = db.getDeposit(query) || pendingList.find(d => 
            (d.ref_no && d.ref_no.toLowerCase() === query.toLowerCase()) ||
            (d.id && d.id.toLowerCase() === query.toLowerCase())
        );

        if (!deposit) {
            return sock.reply(m.chat, `❌ Tagihan deposit dengan Ref ID / ID *${query}* tidak ditemukan atau sudah selesai.`, m);
        }

        if (deposit.status === 'paid') {
            return sock.reply(m.chat, `✅ Tagihan ini sudah berstatus PAID (Lunas) sebelumnya.`, m);
        }

        const refNo = deposit.ref_no || deposit.id;
        const amount = Number(deposit.amount);
        const userJid = deposit.user;
        const idempotencyKey = `dep_manual_acc_${deposit.id || refNo}_${Date.now()}`;

        await sock.reply(m.chat, `⏳ Sedang mengkreditkan saldo *Rp${amount.toLocaleString()}* ke user @${userJid.split('@')[0]}...`, m, { mentions: [userJid] });

        try {
            await db.creditBalance(userJid, amount, idempotencyKey);
            db.updateDeposit(refNo, {
                status: 'paid',
                paidAt: new Date().toISOString(),
                isProcessing: false,
                settledVia: 'manual_owner_approval',
                approvedBy: m.sender
            });

            const updatedUser = await db.getUserAsync(userJid);
            const finalBalance = updatedUser ? updatedUser.balance : 0;

            // Kirim notifikasi ke User yang deposit
            try {
                const notifyJid = lidHelper.toJid(deposit.chat || userJid);
                let userMsg = `🎉 *DEPOSIT BERHASIL DIKONFIRMASI!* 🎉\n\n`;
                userMsg += `• Ref ID     : *${refNo}*\n`;
                userMsg += `• Nominal    : *Rp${amount.toLocaleString()}*\n`;
                userMsg += `• Status     : ✅ *LUNAS / PAID (Disetujui Owner)*\n`;
                userMsg += `• Total Saldo: *Rp${finalBalance.toLocaleString()}*\n\n`;
                userMsg += `_Saldo Anda telah berhasil ditambahkan. Terima kasih!_ 🚀`;
                await sock.sendMessage(notifyJid, { text: userMsg });
            } catch (err) {
                console.error('[ ACCDEPO ] Gagal kirim notif ke user:', err.message);
            }

            let replyMsg = `✅ *DEPOSIT BERHASIL DISETUJUI & MASUK KE USER!*\n\n`;
            replyMsg += `• Ref ID     : *${refNo}*\n`;
            replyMsg += `• User       : @${userJid.split('@')[0]}\n`;
            replyMsg += `• Nominal    : *Rp${amount.toLocaleString()}*\n`;
            replyMsg += `• Total Saldo User: *Rp${finalBalance.toLocaleString()}*`;

            await sock.reply(m.chat, replyMsg, m, { mentions: [userJid] });
        } catch (err) {
            console.error('[ ACCDEPO ERROR ]', err.message);
            return sock.reply(m.chat, `❌ Gagal mengkreditkan saldo: ${err.message}`, m);
        }
    }
};
