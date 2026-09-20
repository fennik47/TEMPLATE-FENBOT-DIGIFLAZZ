module.exports = {
    name: "hidetag",
    aliases: ["h", "tagall"],
    run: async (sock, m, { text, isOwner }) => {
        if (!m.isGroup) return sock.reply(m.chat, "❌ Khusus Grup!", m);
        const isAdmin = m.isAdmin;
        if (!isAdmin && !isOwner) return sock.reply(m.chat, "❌ Khusus Admin Grup!", m);

        if (!m.participants) return sock.reply(m.chat, "❌ Gagal mengambil data member grup.", m);
        const participants = m.participants.map(p => p.id);
        
        await sock.sendMessage(m.chat, { 
            text: text || "Panggilan untuk semua member! 📢", 
            mentions: participants 
        });
    }
};
