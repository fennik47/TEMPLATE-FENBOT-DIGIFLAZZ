module.exports = {
    name: "menu",
    aliases: ["help", "?"],
    run: async (sock, m) => {
        const db = require('../lib/db');
        const settings = db.getSettings();
        const sender = m.sender;
        const menuText = `╭──〔 𝗠𝗘𝗡𝗨 𝗨𝗧𝗔𝗠𝗔 〕──╮
┃ • .menu / .help
┃ • .topup (Produk Digiflazz)
┃ • .list (produk manual)
┃ • .buy [sku] [target] (Saldo Bot)
┃ • .buyqris [sku] [target] (QRIS Otomatis)
┃ • .saldo
┃ • .profile
┃ • .upgrade (Silver/Gold)
┃ • .deposit [nominal] (QRIS Otomatis)
┃ • .depomanual [nominal] (Transfer Manual)
┃ • .cekstatus [ref_no]
┃ • .konfirmasi (Bukti TF Manual)
┃ • .payment
┃ • .owner
╰────────────────╯

╭──〔 𝗠𝗘𝗡𝗨 𝗢𝗪𝗡𝗘𝗥 〕──╮
┃ • .digiflazz (saldo)
┃ • .updateprice / .up
┃ • .updatebot (Update GitHub)
┃ • .addsaldo [tag/reply]
┃ • .setrole
┃ • .setprofit
┃ • .listmember
┃ • .addbannermenu
┃ • .addbannertopup
┃ • .setgsheet
┃ • .setmustika [user] [apikey]
┃ • .addrek / .delrek / .addqris
┃ • .recap
┃ • .checkip
┃ • .broadcast [pesan]
╰────────────────╯

╭──〔 𝗠𝗘𝗡𝗨 𝗚𝗥𝗨𝗣 〕──╮
┃ • .addlist / .dellist
┃ • .proses / .done
┃ • .hidetag
┃ • .group [open/close]
┃ • .kick
┃ • .promote
┃ • .join
╰────────────────╯`;

        const fs = require('fs');

        if (settings.thumbnailUrl) {
            let isValidUrl = settings.thumbnailUrl.startsWith('http');
            let isFileExists = !isValidUrl && fs.existsSync(settings.thumbnailUrl);

            if (isValidUrl || isFileExists) {
                try {
                    let imagePayload = isValidUrl ? { url: settings.thumbnailUrl } : fs.readFileSync(settings.thumbnailUrl);
                    await sock.sendMessage(m.chat, {
                        image: imagePayload,
                        caption: menuText
                    }, { quoted: m });
                    return; // Berhasil kirim image
                } catch (err) {
                    console.error('[ MENU ERROR ] Gagal mengirim thumbnail:', err.message);
                }
            } else {
                console.error('[ MENU ERROR ] File thumbnail tidak ditemukan:', settings.thumbnailUrl);
            }
        }

        // Fallback: Kirim text tanpa gambar
        await sock.reply(m.chat, menuText, m);
    }
};
