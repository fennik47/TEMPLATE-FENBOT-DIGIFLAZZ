const db = require('../lib/db');

module.exports = {
    name: "setwelcome",
    aliases: ["welcome"],
    run: async (sock, m, { args, isOwner }) => {
        if (!m.isGroup) return sock.reply(m.chat, '❌ Perintah ini hanya bisa digunakan di grup!', m);
        
        // Cek admin/owner
        const groupMetadata = await sock.groupMetadata(m.chat);
        const participants = groupMetadata.participants;
        const groupAdmins = participants.filter(p => p.admin !== null).map(p => p.id);
        const isAdmin = groupAdmins.includes(m.sender);
        
        if (!isAdmin && !isOwner) {
            return sock.reply(m.chat, '❌ Khusus Admin Grup atau Owner Bot!', m);
        }

        const command = args[0] ? args[0].toLowerCase() : '';
        if (command === 'on' || command === 'off') {
            const status = command === 'on';
            const settings = db.getSettings();
            
            // Kita simpan setting per grup agar lebih spesifik (opsional, tapi lebih baik)
            // Namun untuk saat ini kita set global agar mudah, atau per grup?
            // Mari kita buat per grup!
            let groupSettings = db.getGroupSettings(m.chat);
            if (!groupSettings) groupSettings = {};
            
            groupSettings.welcomeMode = status;
            db.updateGroupSettings(m.chat, groupSettings);
            
            return sock.reply(m.chat, `✅ Fitur Welcome & Goodbye berhasil di *${status ? 'Aktifkan' : 'Matikan'}* untuk grup ini.`, m);
        } else {
            return sock.reply(m.chat, '❌ Format salah!\nGunakan: *.setwelcome on* atau *.setwelcome off*', m);
        }
    }
};
