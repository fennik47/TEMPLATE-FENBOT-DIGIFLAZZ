const db = require('../lib/db');
const lidHelper = require('../lib/lidHelper');

module.exports = {
    name: "broadcast",
    aliases: ["bc"],
    run: async (sock, m, { args, isOwner }) => {
        if (!isOwner) return sock.reply(m.chat, "❌ Khusus Owner!", m);
        if (!args || args.length === 0) return sock.reply(m.chat, "❌ Masukkan pesan broadcast!", m);

        const message = args.join(" ");
        const data = db.readDB();
        const rawUsers = Object.keys(data.users || {});
        const targetUsers = [...new Set(rawUsers.map(u => lidHelper.toJid(u)).filter(u => u.endsWith('@s.whatsapp.net')))];

        await sock.reply(m.chat, `⏳ Mengirim broadcast ke ${targetUsers.length} user...`, m);

        let success = 0;
        let failed = 0;

        for (const jid of targetUsers) {
            try {
                await sock.sendMessage(jid, { text: `📢 *BROADCAST OWNER*\n\n${message}` });
                success++;
                await new Promise(res => setTimeout(res, 1500));
            } catch {
                failed++;
            }
        }

        await sock.reply(m.chat, `✅ Broadcast Selesai!\n\n• Berhasil: ${success}\n• Gagal: ${failed}`, m);
    }
};
