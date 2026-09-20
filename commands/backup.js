const { runBackup } = require('../lib/backup');

module.exports = {
    name: "backup",
    run: async (sock, m, { isOwner }) => {
        if (!isOwner) return sock.reply(m.chat, "❌ Khusus Owner!", m);

        await sock.reply(m.chat, "⏳ Sedang memproses backup file... Mohon tunggu.", m);

        try {
            await runBackup(sock, 'Manual');
            await sock.reply(m.chat, "✅ Backup Manual berhasil dibuat dan dikirim ke nomor Anda.", m);
        } catch (err) {
            await sock.reply(m.chat, `❌ Gagal melakukan backup: ${err.message}`, m);
        }
    }
};
