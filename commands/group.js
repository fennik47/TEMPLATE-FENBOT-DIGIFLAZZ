module.exports = {
    name: "group",
    run: async (sock, m, { args, isOwner }) => {
        if (!m.isGroup) return sock.reply(m.chat, "❌ Khusus Grup!", m);
        const isAdmin = m.isAdmin;
        if (!isAdmin && !isOwner) return sock.reply(m.chat, "❌ Khusus Admin Grup!", m);

        if (args[0] === 'open') {
            await sock.groupSettingUpdate(m.chat, 'not_announcement');
            await sock.reply(m.chat, "✅ Grup berhasil dibuka! Member sekarang bisa mengirim pesan.", m);
        } else if (args[0] === 'close') {
            await sock.groupSettingUpdate(m.chat, 'announcement');
            await sock.reply(m.chat, "🔒 Grup berhasil ditutup! Hanya admin yang bisa mengirim pesan.", m);
        } else {
            await sock.reply(m.chat, "❌ Gunakan: `.group open` atau `.group close`.", m);
        }
    }
};
