const db = require('../lib/db');
const lidHelper = require('../lib/lidHelper');

module.exports = {
    name: "addsaldo",
    aliases: ["tambahsaldo"],
    run: async (sock, m, { args, isOwner }) => {
        if (!isOwner) return sock.reply(m.chat, 'Hanya Owner yang bisa menambah saldo!', m);

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
            return sock.reply(m.chat, `❌ *Format Salah!*\n\n*Penggunaan:* .addsaldo [Tag/Reply User] [Jumlah]\n*Contoh:* .addsaldo @62857xxx 50000`, m);
        }

        const user = db.getUser(target);
        const before = user.balance;
        const after = before + amount;
        db.updateUser(target, { balance: after });

        await sock.reply(m.chat, `✅ Berhasil menambah saldo @${target.split('@')[0]} sebesar Rp${amount.toLocaleString()}\nTotal Saldo: Rp${after.toLocaleString()}`, m, { mentions: [target] });

        const notifMsg = `📢 *Saldo Anda Telah Ditambah!*\n\n• Saldo Sebelumnya: Rp${before.toLocaleString()}\n• Penambahan: +Rp${amount.toLocaleString()}\n• Saldo Sekarang: Rp${after.toLocaleString()}`;
        try {
            await sock.sendMessage(target, { text: notifMsg });
        } catch (e) {
            console.error('[ ADD SALDO NOTIF ] Gagal mengirim pesan ke user:', e);
        }
    }
};
