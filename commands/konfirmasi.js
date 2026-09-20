const config = require('../config/config');
const lidHelper = require('../lib/lidHelper');

module.exports = {
    name: "konfirmasi",
    aliases: ["confirm"],
    run: async (sock, m, { args }) => {
        const q = m.quoted ? m.quoted : m;
        const isImage = m.type === 'imageMessage' || (m.quoted && m.quoted.type === 'imageMessage');
        
        if (!isImage) return sock.reply(m.chat, "❌ Silakan kirim/reply bukti transfer (gambar) dengan caption *.konfirmasi [nominal]*", m);
        
        const amount = args[0] || "Tidak disebutkan";
        const userJid = lidHelper.toJid(m.sender);
        const senderLabel = userJid.split('@')[0];
        const cleanNominal = amount.replace(/[^0-9]/g, '');
        
        const adminMsg = `🚨 *KONFIRMASI DEPOSIT BARU*\n\n` +
                         `• Dari: @${senderLabel}\n` +
                         `• Nomor: ${senderLabel}\n` +
                         `• Nominal: *Rp${amount}*\n\n` +
                         `_Silakan cek mutasi dan tambah saldo menggunakan command:_\n` +
                         `\`.addsaldo ${senderLabel} ${cleanNominal || '0'}\``;

        try {
            const imageBuffer = await q.download();
            for (const ownerNumber of config.owner) {
                const ownerJid = lidHelper.toJid(ownerNumber);
                await sock.sendMessage(ownerJid, {
                    image: imageBuffer,
                    caption: adminMsg,
                    mentions: [userJid]
                });
            }
            await sock.reply(m.chat, "✅ Bukti transfer telah terkirim ke Admin. Mohon tunggu proses verifikasi saldo Anda.", m);
        } catch (err) {
            await sock.reply(m.chat, `❌ Gagal memproses bukti transfer: ${err.message}`, m);
        }
    }
};
