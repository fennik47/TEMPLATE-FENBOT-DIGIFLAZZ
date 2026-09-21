const crypto = require('crypto');
const db = require('../lib/db');
const lidHelper = require('../lib/lidHelper');

module.exports = {
    name: "minsaldo",
    aliases: ["kurangsaldo", "deductsaldo", "removesaldo"],
    run: async (sock, m, { args, isOwner }) => {
        if (!isOwner) return sock.reply(m.chat, 'Hanya Owner yang bisa mengurangi saldo!', m);

        let target = '';
        if (m.quoted) {
            target = lidHelper.toJid(m.quoted.sender);
        } else if (m.msg?.contextInfo?.mentionedJid?.length > 0) {
            target = lidHelper.toJid(m.msg.contextInfo.mentionedJid[0]);
        } else if (args[0]) {
            target = lidHelper.toJid(args[0]);
        }

        const amount = m.quoted ? parseInt(args[0]) : parseInt(args[1]);
        if (!target || isNaN(amount) || amount <= 0) {
            return sock.reply(m.chat, `❌ *Format Salah!*\n\n*Penggunaan:* .minsaldo [Tag/Reply User] [Jumlah]\n*Contoh:* .minsaldo @62857xxx 50000`, m);
        }

        try {
            const idempotencyKey = `min_${target.replace(/\D/g, '')}_${amount}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
            await db.debitBalance(target, amount, idempotencyKey);
            const user = await db.getUserAsync(target);

            await sock.reply(m.chat, `✅ Berhasil mengurangi saldo @${target.split('@')[0]} sebesar Rp${amount.toLocaleString()}\nTotal Saldo: Rp${user.balance.toLocaleString()}`, m, { mentions: [target] });

            const notifMsg = `📢 *Saldo Anda Telah Dikurangi!*\n\n• Pengurangan: -Rp${amount.toLocaleString()}\n• Saldo Sekarang: Rp${user.balance.toLocaleString()}`;
            try {
                await sock.sendMessage(target, { text: notifMsg });
            } catch (e) {
                console.error('[ MIN SALDO NOTIF ] Gagal mengirim pesan ke user:', e.message);
            }
        } catch (err) {
            console.error('[ MIN SALDO ERROR ]', err.message);
            return sock.reply(m.chat, `❌ Gagal mengurangi saldo: ${err.message}`, m);
        }
    }
};
