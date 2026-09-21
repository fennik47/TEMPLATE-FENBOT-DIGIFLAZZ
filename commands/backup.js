const fenbot = require('../lib/fenbot');

module.exports = {
    name: "backup",
    run: async (sock, m, { isOwner }) => {
        if (!isOwner) return sock.reply(m.chat, "❌ Khusus Owner!", m);

        await sock.reply(m.chat, "⏳ Sedang menyinkronkan sesi dan status bot ke FENBOT Cloud Storage...", m);

        try {
            const synced = await fenbot.syncSession("session");
            if (synced) {
                await sock.reply(m.chat, "✅ Sesi WhatsApp dan metadata bot berhasil dicadangkan ke Cloud Storage (R2/S3). Seluruh data pesanan dan dompet tersimpan permanen di PostgreSQL FENBOT Cloud.", m);
            } else {
                await sock.reply(m.chat, "ℹ️ Status sinkronisasi: Sesi aktif telah tersimpan di cloud.", m);
            }
        } catch (err) {
            await sock.reply(m.chat, `❌ Gagal sinkronisasi backup: ${err.message}`, m);
        }
    }
};
