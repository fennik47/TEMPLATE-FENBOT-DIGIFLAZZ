const db = require('../lib/db');

module.exports = {
    name: "setprofit",
    aliases: ["setmarkup", "margin"],
    run: async (sock, m, { args, isOwner }) => {
        if (!isOwner) return sock.reply(m.chat, "❌ Khusus Owner!", m);

        const settings = db.getSettings();

        if (!args || args.length < 2) {
            let txt = `📊 *PENGATURAN PROFIT SAAT INI*\n\n`;
            for (let role in settings.margins) {
                txt += `• ${role}: *${(settings.margins[role] * 100).toFixed(1)}%*\n`;
            }
            txt += `\n💡 Cara ubah: \`.setprofit [ROLE] [PERSEN]\`\nContoh: \`.setprofit GOLD 5\``;
            return sock.reply(m.chat, txt, m);
        }

        const role = args[0].toUpperCase();
        const percent = parseFloat(args[1]);

        if (isNaN(percent)) return sock.reply(m.chat, "❌ Persen harus angka!", m);


        if (!settings.margins.hasOwnProperty(role)) {
            return sock.reply(m.chat, `❌ Role tidak valid!\nValid: ${Object.keys(settings.margins).join(", ")}`, m);
        }

        const newMargin = percent / 100;
        settings.margins[role] = newMargin;
        
        db.updateSettings({ margins: settings.margins });

        await sock.reply(m.chat, `✅ Profit untuk role *${role}* berhasil diubah menjadi *${percent}%*`, m);
    }
};
