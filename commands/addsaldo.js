const crypto = require('crypto');
const db = require('../lib/db');
const lidHelper = require('../lib/lidHelper');

module.exports = {
    name: "addsaldo",
    aliases: ["tambahsaldo"],
    run: async (sock, m, { args, isOwner }) => {
        if (!isOwner) return sock.reply(m.chat, 'Hanya Owner yang bisa menambah saldo!', m);

        let target = '';
        let amount = NaN;

        if (m.quoted) {
            target = lidHelper.toJid(m.quoted.sender);
            amount = parseInt(args[0]);
            if (isNaN(amount) && args[1]) {
                amount = parseInt(args[1]);
            }
        } else if (m.msg?.contextInfo?.mentionedJid?.length > 0) {
            target = lidHelper.toJid(m.msg.contextInfo.mentionedJid[0]);
            amount = parseInt(args[1]);
            if (isNaN(amount)) {
                amount = parseInt(args[0]);
            }
        } else if (args.length >= 2) {
            const arg0Num = parseInt(args[0]);
            const arg1Num = parseInt(args[1]);

            if (args[0].length >= 8 && !isNaN(arg1Num)) {
                target = lidHelper.toJid(args[0]);
                amount = arg1Num;
            } else if (args[1].length >= 8 && !isNaN(arg0Num)) {
                target = lidHelper.toJid(args[1]);
                amount = arg0Num;
            } else {
                target = lidHelper.toJid(args[0]);
                amount = arg1Num;
            }
        } else if (args.length === 1 && !isNaN(parseInt(args[0]))) {
            // Owner menambah saldo ke dirinya sendiri: .addsaldo 10000
            target = lidHelper.toJid(m.sender);
            amount = parseInt(args[0]);
        }

        if (!target || isNaN(amount) || amount <= 0) {
            return sock.reply(
                m.chat,
                `❌ *Format Salah!*\n\n*Cara Penggunaan:*\n` +
                `• *Tambah saldo sendiri:* .addsaldo 50000\n` +
                `• *Tambah saldo user:* .addsaldo 62857xxx 50000\n` +
                `• *Tag user:* .addsaldo @user 50000\n` +
                `• *Reply pesan user:* .addsaldo 50000`,
                m
            );
        }

        try {
            const cleanPhone = target.replace(/\D/g, '');
            const idempotencyKey = `add_${cleanPhone}_${amount}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
            await db.creditBalance(target, amount, idempotencyKey);
            const user = await db.getUserAsync(target);

            const displayUser = target.split('@')[0];
            await sock.reply(
                m.chat,
                `✅ *Berhasil Menambah Saldo!*\n\n` +
                `• Penerima: @${displayUser}\n` +
                `• Penambahan: +Rp${amount.toLocaleString('id-ID')}\n` +
                `• Total Saldo Sekarang: Rp${(user.balance || 0).toLocaleString('id-ID')}`,
                m,
                { mentions: [target] }
            );

            const senderJid = lidHelper.toJid(m.sender);
            if (target !== senderJid) {
                const notifMsg = `📢 *Saldo Anda Telah Ditambah oleh Owner!*\n\n` +
                    `• Penambahan: +Rp${amount.toLocaleString('id-ID')}\n` +
                    `• Saldo Sekarang: Rp${(user.balance || 0).toLocaleString('id-ID')}`;
                try {
                    await sock.sendMessage(target, { text: notifMsg });
                } catch (e) {
                    console.error('[ ADD SALDO NOTIF ] Gagal mengirim pesan ke user:', e.message);
                }
            }
        } catch (err) {
            console.error('[ ADD SALDO ERROR ]', err.message);
            return sock.reply(m.chat, `❌ Gagal menambah saldo: ${err.message}`, m);
        }
    }
};
