const db = require('../lib/db');
const lidHelper = require('../lib/lidHelper');

module.exports = {
    name: "saldo",
    aliases: ["ceksaldo", "balance"],
    run: async (sock, m) => {
        const userId = lidHelper.toJid(m.sender);
        const user = db.getUser(userId);
        const text = `╭─「 SALDO USER 」\n│ Nomor: @${userId.split('@')[0]}\n│ Saldo: Rp${(user.balance || 0).toLocaleString()}\n│ Role: ${user.role}\n╰──────────`;
        await sock.reply(m.chat, text, m, { mentions: [userId] });
    }
};
