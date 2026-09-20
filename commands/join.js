module.exports = {
    name: "join",
    run: async (sock, m, { text, isOwner }) => {
        if (!isOwner) return sock.reply(m.chat, "❌ Khusus Owner!", m);
        if (!text) return sock.reply(m.chat, "❌ Masukkan link grup!", m);
        if (!text.includes("chat.whatsapp.com/")) return sock.reply(m.chat, "❌ Link tidak valid!", m);

        const code = text.split("chat.whatsapp.com/")[1];
        try {
            await sock.groupAcceptInvite(code);
            await sock.reply(m.chat, "✅ Berhasil bergabung ke grup!", m);
        } catch (err) {
            await sock.reply(m.chat, `❌ Gagal bergabung: ${err.message}`, m);
        }
    }
};
