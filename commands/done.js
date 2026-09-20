const db = require('../lib/db');

module.exports = {
    name: "done",
    run: async (sock, m, { text, isOwner }) => {
        if (!m.isGroup && !isOwner) return;
        const isAdmin = m.isGroup ? m.isAdmin : false;
        if (!isAdmin && !isOwner) return sock.reply(m.chat, "❌ Khusus Admin Grup!", m);

        let target = m.quoted ? m.quoted.sender : (m.msg?.contextInfo?.mentionedJid?.[0] ? m.msg.contextInfo.mentionedJid[0] : null);
        if (!target) return sock.reply(m.chat, "❌ Tag atau reply user yang sudah selesai!", m);

        const jam = new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' });
        const tanggal = new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' });

        let msg = `✅ *PESANAN SELESAI / DONE*\n\n`;
        msg += `👤 *Pembeli:* @${target.split("@")[0]}\n`;
        msg += `📦 *Pesanan:* ${text || "Cek Chat"}\n`;
        msg += `📅 *Tanggal:* ${tanggal}\n`;
        msg += `⌚ *Jam:* ${jam}\n\n`;
        msg += `_Terima kasih telah berbelanja di toko kami!_`;

        await sock.sendMessage(m.chat, { text: msg, mentions: [target] }, { quoted: m });
    }
};
