const db = require('../lib/db');
const lidHelper = require('../lib/lidHelper');

module.exports = {
    name: "listmember",
    aliases: ["listuser", "member", "daftarmember", "memberlist"],
    run: async (sock, m, { isOwner }) => {
        if (!isOwner) return sock.reply(m.chat, "❌ Khusus Owner!", m);

        const usersData = db.readDB().users;
        const registeredUsers = Object.values(usersData).filter(u => u.registered);
        
        if (registeredUsers.length === 0) {
            return sock.reply(m.chat, "Belum ada member yang terdaftar.", m);
        }

        registeredUsers.sort((a, b) => (b.balance || 0) - (a.balance || 0));

        let txt = `👥 *DAFTAR MEMBER TERDAFTAR*\n\n`;
        txt += `Total Member: *${registeredUsers.length}*\n`;
        txt += `─────────────────\n\n`;

        registeredUsers.forEach((u, i) => {
            const roleStr = u.role === 'OWNER' ? '👑 OWNER' : u.role;
            const cleanJid = lidHelper.toJid(u.jid);
            const jidRaw = cleanJid.split('@')[0];
            
            txt += `*${i + 1}. ${(u.name || 'Unknown').toUpperCase()}*\n`;
            txt += `   ├ No: ${jidRaw}\n`;
            txt += `   ├ Role: ${roleStr}\n`;
            txt += `   ├ Saldo: Rp${(u.balance || 0).toLocaleString()}\n`;
            txt += `   ╰ Trx: ${u.total_order || 0}\n\n`;
        });

        await sock.reply(m.chat, txt.trim(), m);
    }
};
