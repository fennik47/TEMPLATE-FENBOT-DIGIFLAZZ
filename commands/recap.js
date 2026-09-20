const db = require('../lib/db');

module.exports = {
    name: "recap",
    aliases: ["laporan", "profit"],
    run: async (sock, m, { isOwner }) => {
        if (!isOwner) return sock.reply(m.chat, "❌ Khusus Owner!", m);

        const data = db.readDB();
        const transactions = Object.values(data.transactions || {});
        const successTrx = transactions.filter(t => t.status === 'success');

        const daily = successTrx.reduce((acc, t) => {
            const rawTime = t.time || t.timestamp;
            const date = rawTime ? rawTime.split('T')[0] : 'Unknown';
            if (!acc[date]) acc[date] = { count: 0, modal: 0, omzet: 0 };
            acc[date].count += 1;
            acc[date].modal += (t.modal || 0);
            acc[date].omzet += (t.price || 0);
            return acc;
        }, {});

        let txt = `📊 *REKAP TRANSAKSI SUKSES*\n\n`;
        const dates = Object.keys(daily).sort().reverse().slice(0, 7);

        if (dates.length === 0) {
            txt += `Belum ada transaksi sukses.`;
        } else {
            dates.forEach(date => {
                const d = daily[date];
                const profit = d.omzet - d.modal;
                txt += `📅 *Tanggal: ${date}*\n`;
                txt += `• Jumlah: ${d.count} Trx\n`;
                txt += `• Omzet: Rp${d.omzet.toLocaleString()}\n`;
                txt += `• Profit: *Rp${profit.toLocaleString()}*\n`;
                txt += `───────────────\n`;
            });
            
            const totalOmzet = successTrx.reduce((acc, t) => acc + (t.price || 0), 0);
            const totalModal = successTrx.reduce((acc, t) => acc + (t.modal || 0), 0);
            const totalProfit = totalOmzet - totalModal;
            
            txt += `\n💰 *TOTAL KESELURUHAN*\n`;
            txt += `• Total Omzet: Rp${totalOmzet.toLocaleString()}\n`;
            txt += `• Total Profit: *Rp${totalProfit.toLocaleString()}*\n`;
        }

        await sock.reply(m.chat, txt, m);
    }
};
