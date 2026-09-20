const lidHelper = require('../lib/lidHelper');

module.exports = {
    name: "promote",
    run: async (sock, m, { args, isOwner }) => {
        if (!m.isGroup) return sock.reply(m.chat, 'Fitur ini hanya untuk grup!', m);
        if (!m.isAdmin && !isOwner) return sock.reply(m.chat, "❌ Khusus Admin Grup!", m);

        let users = [];
        if (m.quoted) {
            users = [lidHelper.toJid(m.quoted.sender)];
        } else if (m.msg?.contextInfo?.mentionedJid?.length > 0) {
            users = m.msg.contextInfo.mentionedJid.map(u => lidHelper.toJid(u));
        } else if (args.length > 0) {
            users = args.map(v => lidHelper.toJid(v));
        }

        users = users.filter(Boolean);
        if (users.length === 0) return sock.reply(m.chat, 'Tag atau reply orang yang ingin di-promote!', m);

        try {
            await sock.groupParticipantsUpdate(m.chat, users, 'promote');
            await sock.reply(m.chat, 'Berhasil menjadikan admin.', m);
        } catch (err) {
            await sock.reply(m.chat, '❌ Gagal! Pastikan bot sudah menjadi admin grup.', m);
        }
    }
};
