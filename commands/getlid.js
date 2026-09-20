const lidHelper = require('../lib/lidHelper');

module.exports = {
    name: "getlid",
    aliases: ["mylid", "cekid", "id"],
    run: async (sock, m) => {
        const jid = lidHelper.toJid(m.sender);
        const lid = lidHelper.toLid(m.sender);
        const chatJid = m.chat;

        let txt = `🆔 *INFORMASI IDENTITAS WHATSAPP*\n\n`;
        txt += `• *Nomor / JID:* \`${jid}\`\n`;
        txt += `• *LID Akun:* \`${lid !== jid ? lid : 'Belum terpetakan / Menggunakan JID Asli'}\`\n`;
        txt += `• *Chat JID:* \`${chatJid}\`\n`;
        txt += `• *Tipe Chat:* ${m.isGroup ? 'Grup WhatsApp' : 'Private Chat'}\n\n`;
        txt += `_Sistem bot secara otomatis mengonversi LID ke nomor WhatsApp asli Anda._`;

        await sock.reply(m.chat, txt, m);
    }
};
