const axios = require('axios');
const FormData = require('form-data');

module.exports = {
    name: "tourl",
    aliases: ["tolink", "upload"],
    run: async (sock, m) => {
        const q = m.quoted ? m.quoted : m;
        const mime = (q.msg || q).mimetype || '';

        if (!mime.startsWith('image/') && !mime.startsWith('video/')) {
            return sock.reply(m.chat, '❌ Kirim atau Reply gambar/video dengan caption *.tourl*', m);
        }

        try {
            await sock.reply(m.chat, '⏳ *Sedang mengunggah media ke server...*', m);
            
            // Download media as buffer
            const buffer = await q.download();
            
            // Limit size to 50MB for catbox (Bot WhatsApp usually limits at 16MB anyway)
            if (buffer.length > 50 * 1024 * 1024) {
                return sock.reply(m.chat, '❌ Ukuran file terlalu besar! Maksimal 50MB.', m);
            }

            // Create form data for catbox.moe
            const form = new FormData();
            form.append('reqtype', 'fileupload');
            form.append('fileToUpload', buffer, {
                filename: 'media.' + mime.split('/')[1].split(';')[0],
                contentType: mime
            });

            // Upload to catbox.moe (Lebih stabil dari telegra.ph dan mendukung semua format)
            const res = await axios.post('https://catbox.moe/user/api.php', form, {
                headers: {
                    ...form.getHeaders()
                }
            });

            if (res.data && res.data.startsWith('http')) {
                const url = res.data;
                
                let txt = `✅ *BERHASIL UPLOAD*\n\n`;
                txt += `» *URL:* ${url}\n`;
                txt += `» *Ukuran:* ${(buffer.length / 1024).toFixed(2)} KB\n`;
                txt += `» *Tipe:* ${mime.split(';')[0]}\n\n`;
                txt += `_URL ini berlaku permanen._`;

                await sock.reply(m.chat, txt, m);
            } else {
                await sock.reply(m.chat, '❌ Gagal mengunggah media ke server.', m);
            }
        } catch (err) {
            console.error('[ TOURL ERROR ]', err.response?.data || err.message);
            await sock.reply(m.chat, `❌ Terjadi kesalahan: ${err.message}`, m);
        }
    }
};
