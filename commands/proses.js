const db = require('../lib/db');

module.exports = {
    name: "proses",
    run: async (sock, m, { text, isOwner }) => {
        if (!m.isGroup && !isOwner) return;
        if (!m.isAdmin && !isOwner) return sock.reply(m.chat, "❌ Khusus Admin Grup!", m);

        let target = m.quoted ? m.quoted.sender : (m.mentionedJid && m.mentionedJid[0] ? m.mentionedJid[0] : null);
        if (!target) return sock.reply(m.chat, "❌ Tag atau reply user yang ingin diproses!", m);

        const jam = new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' });
        const tanggal = new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' });

        let msg = `⏳ *PESANAN SEDANG DIPROSES*\n\n`;
        msg += `👤 *Pembeli:* @${target.split("@")[0]}\n`;
        msg += `📦 *Pesanan:* ${text || "Cek Chat"}\n`;
        msg += `📅 *Tanggal:* ${tanggal}\n`;
        msg += `⌚ *Jam:* ${jam}\n\n`;
        msg += `_Mohon ditunggu ya kak, pesanan sedang diproses admin._`;

        await sock.sendMessage(m.chat, { text: msg, mentions: [target] }, { quoted: m });
    }
};
