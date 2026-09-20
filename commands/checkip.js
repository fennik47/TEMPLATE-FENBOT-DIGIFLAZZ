const axios = require('axios');

module.exports = {
    name: "checkip",
    aliases: ["myip", "ip"],
    run: async (sock, m, { isOwner }) => {
        if (!isOwner) return sock.reply(m.chat, 'Hanya untuk Owner!', m);

        try {
            const res = await axios.get('https://api.ipify.org?format=json');
            const ip = res.data.ip;
            
            let txt = `🌐 *INFORMASI IP SERVER*\n\n`;
            txt += `• IP Publik: *${ip}*\n`;
            txt += `• Port: *3000* (Default)\n\n`;
            txt += `Gunakan IP di atas untuk Whitelist di Digiflazz.\n`;
            txt += `Pastikan port di panel sudah dibuka jika menggunakan Pterodactyl.`;
            
            await sock.reply(m.chat, txt, m);
        } catch (err) {
            await sock.reply(m.chat, 'Gagal mengambil informasi IP.', m);
        }
    }
};
