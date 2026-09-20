const fs = require('fs');
const path = require('path');

module.exports = {
    name: "setbggoodbye",
    run: async (sock, m, { isOwner }) => {
        // Cek admin/owner
        let isAdmin = false;
        if (m.isGroup) {
            const groupMetadata = await sock.groupMetadata(m.chat);
            const participants = groupMetadata.participants;
            const groupAdmins = participants.filter(p => p.admin !== null).map(p => p.id);
            isAdmin = groupAdmins.includes(m.sender);
        } else {
            isAdmin = true; // Allow owner in PC
        }
        
        if (!isAdmin && !isOwner) {
            return sock.reply(m.chat, '❌ Khusus Admin Grup atau Owner Bot!', m);
        }

        const isImage = m.type === 'imageMessage' || (m.quoted && m.quoted.type === 'imageMessage');
        if (!isImage) {
            return sock.reply(m.chat, '❌ Kirim atau balas gambar dengan caption *.setbggoodbye*\n\nUkuran gambar yang disarankan: *800 x 400 pixel* (Mendatar/Landscape).', m);
        }

        try {
            // Download gambar
            const media = m.type === 'imageMessage' ? await m.download() : await m.quoted.download();
            const filePath = path.join(__dirname, '../database/goodbye_bg.png');
            
            // Simpan gambar
            fs.writeFileSync(filePath, media);
            
            return sock.reply(m.chat, '✅ Berhasil mengubah Background Goodbye!\n\nDesain Canva Anda sekarang sudah terpasang. Coba keluarkan member untuk melihat hasilnya.', m);
        } catch (err) {
            console.error(err);
            return sock.reply(m.chat, '❌ Gagal mengunduh dan menyimpan gambar.', m);
        }
    }
};
