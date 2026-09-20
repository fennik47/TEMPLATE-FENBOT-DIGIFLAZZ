const db = require('../lib/db');
const { getWIBDate } = require('../lib/helper');
const lidHelper = require('../lib/lidHelper');

module.exports = {
    name: "profile",
    aliases: ["me", "profil"],
    run: async (sock, m) => {
        const userId = lidHelper.toJid(m.sender);
        const user = db.getUser(userId);
        const data = db.readDB();
        const userTransactions = Object.values(data.transactions || {}).filter(t => lidHelper.toJid(t.user) === userId);
        
        const totalOrder = userTransactions.length;
        const totalSpent = userTransactions.filter(t => t.status === 'success').reduce((acc, curr) => acc + (curr.price || 0), 0);

        let txt = `👤 *USER PROFILE*\n\n`;
        txt += `• Nama: *${user.name || m.pushName || 'User'}*\n`;
        txt += `• Nomor: *${userId.split('@')[0]}*\n`;
        txt += `• Role: *${user.role}*\n`;
        txt += `• Saldo: *Rp${(user.balance || 0).toLocaleString()}*\n\n`;
        
        txt += `📊 *STATISTIK*\n`;
        txt += `• Total Order: *${totalOrder}*\n`;
        txt += `• Total Belanja: *Rp${totalSpent.toLocaleString()}*\n\n`;
        
        txt += `📅 Tanggal: ${getWIBDate()}`;
        
        await sock.reply(m.chat, txt, m);
    }
};
