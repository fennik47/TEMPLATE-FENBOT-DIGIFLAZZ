module.exports = {
    name: "linkgc",
    run: async (sock, m, { isOwner }) => {
        if (!m.isGroup) return sock.reply(m.chat, "❌ Khusus Grup!", m);
        try {
            const code = await sock.groupInviteCode(m.chat);
            await sock.reply(m.chat, `🔗 *Link Grup:* https://chat.whatsapp.com/${code}`, m);
        } catch (err) {
            await sock.reply(m.chat, "❌ Gagal! Pastikan bot sudah menjadi admin grup.", m);
        }
    }
};
