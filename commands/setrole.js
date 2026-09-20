const db = require('../lib/db');
const lidHelper = require('../lib/lidHelper');

module.exports = {
    name: "setrole",
    aliases: ["role"],
    run: async (sock, m, { args, isOwner }) => {
        if (!isOwner) return sock.reply(m.chat, "❌ Khusus Owner!", m);

        let target = '';
        let role = '';

        if (m.quoted) {
            target = lidHelper.toJid(m.quoted.sender);
            role = (args[0] || '').toUpperCase();
        } else if (m.msg?.contextInfo?.mentionedJid?.length > 0) {
            target = lidHelper.toJid(m.msg.contextInfo.mentionedJid[0]);
            role = (args[1] || args[0] || '').toUpperCase();
        } else if (args.length >= 2) {
            target = lidHelper.toJid(args[0]);
            role = (args[1] || '').toUpperCase();
        }

        const validRoles = ["BRONZE", "SILVER", "GOLD", "PLATINUM", "OWNER"];
        if (!target || !validRoles.includes(role)) {
            return sock.reply(m.chat, `❌ Format salah atau Role tidak valid!\n\n*Penggunaan:* .setrole [Tag/Reply/Nomor] [ROLE]\n*Pilihan Role:* ${validRoles.join(", ")}\n*Contoh:* .setrole @628xxx GOLD`, m);
        }

        const user = db.getUser(target);
        db.updateUser(target, { role: role });
        
        await sock.reply(m.chat, `✅ Berhasil mengubah role @${target.split('@')[0]} menjadi *${role}*`, m, { mentions: [target] });
        try {
            await sock.sendMessage(target, { text: `🎉 Selamat! Role Anda telah diubah menjadi *${role}* oleh Owner.` });
        } catch { }
    }
};
