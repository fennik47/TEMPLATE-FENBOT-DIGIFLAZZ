const db = require('../lib/db');
const fs = require('fs-extra');
const path = require('path');

module.exports = {
    name: "upgrade",
    aliases: ["upgraderole", "premium"],
    run: async (sock, m) => {
        const settings = db.getSettings();
        const userId = require('../lib/lidHelper').toJid(m.sender);
        const user = db.getUser(userId);
        
        let txt = `✨ *UPGRADE ROLE MEMBER* ✨\n\n`;
        txt += `Dapatkan harga produk yang jauh lebih murah dengan mengupgrade role akun Anda!\n\n`;
        
        txt += `📊 *DAFTAR HARGA & KEUNTUNGAN:*\n\n`;
        
        txt += `🥈 *SILVER* (Rp${settings.upgradePrices.SILVER.toLocaleString()})\n`;
        txt += `└ Potongan harga lebih besar dari Bronze.\n\n`;
        
        txt += `🥇 *GOLD* (Rp${settings.upgradePrices.GOLD.toLocaleString()})\n`;
        txt += `└ Harga sangat murah, cocok untuk reseller.\n\n`;
        
        txt += `💎 *PLATINUM* (Rp${settings.upgradePrices.PLATINUM.toLocaleString()})\n`;
        txt += `└ Harga termurah (Harga Grosir), profit maksimal!\n\n`;
        
        txt += `───────────────\n`;
        txt += `👤 *Status Anda:* ${user.role}\n`;
        txt += `───────────────\n\n`;
        
        txt += `📌 *CARA UPGRADE:*\n`;
        txt += `1. Pilih role yang Anda inginkan.\n`;
        txt += `2. Lakukan pembayaran melalui menu *.payment*\n`;
        txt += `3. Kirim bukti transfer dengan caption: \`.konfirmasi Upgrade ke [ROLE]\`\n\n`;
        txt += `_Contoh: .konfirmasi Upgrade ke GOLD_`;

        await sock.reply(m.chat, txt, m);
    }
};
