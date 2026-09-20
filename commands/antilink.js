const db = require('../lib/db');

module.exports = {
    name: "antilink",
    run: async (sock, m, { args, isOwner }) => {
        if (!m.isGroup) return sock.reply(m.chat, "❌ Khusus Grup!", m);
        const isAdmin = m.isAdmin;
        if (!isAdmin && !isOwner) return sock.reply(m.chat, "❌ Khusus Admin Grup!", m);

        if (!args[0]) return sock.reply(m.chat, "❌ Gunakan: `.antilink on` atau `.antilink off`.", m);

        if (args[0] === 'on') {
            db.updateGroupSettings(m.chat, { antilink: true });
            await sock.reply(m.chat, "✅ Antilink berhasil diaktifkan!", m);
        } else if (args[0] === 'off') {
            db.updateGroupSettings(m.chat, { antilink: false });
            await sock.reply(m.chat, "✅ Antilink berhasil dinonaktifkan!", m);
        } else {
            await sock.reply(m.chat, "❌ Gunakan: `.antilink on` atau `.antilink off`.", m);
        }
    }
};
