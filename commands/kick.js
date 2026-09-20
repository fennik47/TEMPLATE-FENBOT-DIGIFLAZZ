const lidHelper = require('../lib/lidHelper');

module.exports = {
    name: "kick",
    run: async (sock, m, { args, isOwner }) => {
        if (!m.isGroup) return sock.reply(m.chat, 'Fitur ini hanya untuk grup!', m);
        if (!m.isAdmin && !isOwner) return sock.reply(m.chat, 'Anda bukan admin!', m);

        let users = [];
        if (m.quoted) {
            users = [lidHelper.toJid(m.quoted.sender)];
        } else if (m.msg?.contextInfo?.mentionedJid?.length > 0) {
            users = m.msg.contextInfo.mentionedJid.map(u => lidHelper.toJid(u));
        } else if (args.length > 0) {
            users = args.map(v => lidHelper.toJid(v));
        }

        users = users.filter(Boolean);
        if (users.length === 0) return sock.reply(m.chat, 'Tag atau reply orang yang ingin di-kick!', m);

        try {
            await sock.groupParticipantsUpdate(m.chat, users, 'remove');
            await sock.reply(m.chat, 'Berhasil mengeluarkan user.', m);
        } catch (err) {
            await sock.reply(m.chat, '❌ Gagal! Pastikan bot sudah menjadi admin grup.', m);
        }
    }
};
