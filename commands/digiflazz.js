const digiflazz = require('../lib/digiflazz');
const config = require('../config/config');

module.exports = {
    name: "digiflazz",
    aliases: ["df", "cekflazz", "depoflazz"],
    run: async (sock, m, { args, isOwner }) => {
        if (!isOwner) return;

        if (args.length === 0) {
            return sock.reply(m.chat, `───〔 *MANAJEMEN DIGIFLAZZ* 〕───\n\n` +
                `» *.df saldo* (Cek saldo pusat)\n\n` +
                `*Info:* Isi ulang saldo Digiflazz harus dilakukan secara manual lewat Website Digiflazz.`, m);
        }

        const action = args[0].toLowerCase();

        if (action === "saldo" || action === "profil") {
            try {
                const data = await digiflazz.getBalance();
                const formatSaldo = (amount) => `Rp${amount.toLocaleString()}`;
                
                let ngen = `───〔 *PROFILE DIGIFLAZZ* 〕───\n\n`;
                ngen += `» *Username* : ${config.digiflazz.username}\n`;
                ngen += `» *Nama Bot* : ${config.botName}\n`;
                ngen += `» *Saldo*    : ${formatSaldo(data.deposit)}\n`;
                ngen += `» *Status*   : Aktif ✅\n\n`;
                ngen += `_Silakan login ke web Digiflazz untuk deposit saldo._`;
                
                await sock.reply(m.chat, ngen, m);
            } catch (err) {
                await sock.reply(m.chat, `❌ *ERROR:* ${err.message}`, m);
            }
        } else {
            await sock.reply(m.chat, `❌ Perintah tidak dikenal.`, m);
        }
    }
};
