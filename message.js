const chalk = require("chalk");
const fs = require("fs-extra");
const path = require("path");
const config = require("./config/config");
const { getWIBTime } = require("./lib/helper");
const { decodeJid } = require("./lib/serializer");
const lidHelper = require("./lib/lidHelper");
const db = require("./lib/db");

module.exports = async (sock, m) => {
    try {
        const { body, isGroup, chat, fromMe, isBot } = m;
        if (isBot) return;

        const sender = lidHelper.toJid(m.sender);
        m.sender = sender;
        if (!sender) return;

        const senderDigits = sender.replace(/[^0-9]/g, '');
        const normalizePhone = (num) => {
            let clean = (num || '').toString().replace(/[^0-9]/g, '');
            if (clean.startsWith('0')) clean = '62' + clean.slice(1);
            if (clean.startsWith('620')) clean = '62' + clean.slice(3);
            return clean;
        };

        const senderNormalized = normalizePhone(senderDigits);
        const isOwner = config.owner.some(v => {
            const vNormalized = normalizePhone(v);
            return (vNormalized.length >= 8 && vNormalized === senderNormalized) || lidHelper.toJid(v) === sender;
        }) || fromMe;

        const prefix = (config.prefix || []).find((p) => p !== "" && body && body.startsWith(p)) || "";
        const isCmd = prefix !== "";
        const command = isCmd ? body.slice(prefix.length).trim().split(/ +/).shift().toLowerCase() : body.trim().split(/ +/).shift().toLowerCase();
        const args = body ? body.trim().split(/ +/).slice(1) : [];
        const text = args.join(" ");

        if (body) {
            console.log(chalk.black(chalk.bgWhite("[ MSG ]")), 
                chalk.black(chalk.bgGreen(getWIBTime())), 
                chalk.black(chalk.bgBlue(isCmd ? "CMD" : "MSG")), 
                chalk.green(body.slice(0, 50) + (body.length > 50 ? "..." : "")), 
                chalk.white("from"), 
                chalk.yellow(sender.split("@")[0]), 
                isGroup ? chalk.white("in") + " " + chalk.yellow(chat.split("@")[0]) : "");
        }

        if (isGroup) {
            try {
                if (!global.groupMetaCache) global.groupMetaCache = new Map();
                let meta = null;
                const cached = global.groupMetaCache.get(chat);
                if (cached && (Date.now() - cached.time < 5 * 60 * 1000)) {
                    meta = cached.data;
                } else {
                    const fetchPromise = sock.groupMetadata(chat);
                    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('groupMetadata timeout')), 2500));
                    meta = await Promise.race([fetchPromise, timeoutPromise]).catch(() => cached?.data || null);
                    if (meta) global.groupMetaCache.set(chat, { data: meta, time: Date.now() });
                }

                if (meta) {
                    m.groupMetadata = meta;
                    lidHelper.extractFromGroupMetadata(meta);
                    m.participants = (meta.participants || []).map(p => ({
                        ...p,
                        jid: lidHelper.toJid(p.jid || p.id),
                        id: lidHelper.toJid(p.id)
                    }));
                    m.groupAdmins = (meta.participants || []).filter(p => p.admin).map(p => lidHelper.toJid(p.jid || p.id));
                    const botNumber = decodeJid(sock?.user?.id || "").split('@')[0];
                    const senderNumber = sender.split('@')[0];
                    
                    m.isBotAdmin = botNumber ? m.groupAdmins.some(adminJid => adminJid.split('@')[0] === botNumber) : false;
                    m.isAdmin = senderNumber ? m.groupAdmins.some(adminJid => adminJid.split('@')[0] === senderNumber) : false;
                }
            } catch (e) {
                // Ignore metadata fetch error if bot just joined or network lagged
            }
        }

        const userId = sender;
        const user = db.getUser(userId);
        const phoneDigits = sender.replace(/[^0-9]/g, '') || sender.split('@')[0];

        // Silent Auto-Registration / Auto-Provisioning instan
        if (!user.registered) {
            db.updateUser(userId, {
                name: m.pushName || 'Pengguna',
                nomor: phoneDigits,
                registered: true,
                registeredAt: new Date().toISOString()
            });
        } else if (m.pushName && (!user.name || user.name === 'Pengguna')) {
            db.updateUser(userId, { name: m.pushName });
        }

        const commandFiles = fs.readdirSync(path.join(__dirname, "commands")).filter(file => file.endsWith(".js"));
        let isExecuted = false;

        for (const file of commandFiles) {
            const cmd = require(`./commands/${file}`);
            if (cmd.name === command || (cmd.aliases && cmd.aliases.includes(command))) {
                isExecuted = true;
                console.log(chalk.cyan(`[ EXEC ] Executing command: ${command} (${cmd.name}) from ${sender.split('@')[0]}`));
                try {
                    await cmd.run(sock, m, { args, text, isOwner, config });
                } catch (err) {
                    console.log(chalk.red("[ CMD ERROR ] " + err));
                    await sock.reply(chat, `❌ Terjadi kesalahan saat menjalankan perintah *${command}*.\n\n*Reason:* ${err.message}`, m);
                }
                break;
            }
        }

        if (isCmd && !isExecuted) {
            return sock.reply(chat, `❓ Perintah *${command}* tidak ditemukan.\n\nKetik *.menu* untuk melihat daftar perintah yang tersedia.`, m);
        }

        const lowerBody = (body || '').trim().toLowerCase();
        if (lowerBody === "ya" || lowerBody === "tidak" || lowerBody === "batal" || lowerBody === "cancel") {
            if (global.pendingTopup && global.pendingTopup[sender]) {
                const data = global.pendingTopup[sender];
                if (Date.now() - data.timestamp > 300000) {
                    delete global.pendingTopup[sender];
                    return sock.reply(chat, "⏰ Waktu konfirmasi telah habis (5 menit).", m);
                }
                delete global.pendingTopup[sender];
                if (lowerBody === "tidak" || lowerBody === "batal" || lowerBody === "cancel") {
                    return sock.reply(chat, "❌ Pesanan dibatalkan.", m);
                }

                const digiflazz = require('./lib/digiflazz');
                const user = await db.getUserAsync(userId);
                if (user.balance < data.price) return sock.reply(chat, "❌ Saldo tidak cukup.", m);

                const crypto = require('crypto');
                const refId = `TRX${Date.now()}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
                try {
                    // 1. Reserve balance via FENBOT CLOUD ACID row locking
                    await db.reserveBalance(userId, data.price);

                    await sock.reply(chat, `⏳ Pesanan diterima!\nID: ${refId}\nProduk: ${data.product_name}`, m);
                    
                    // 2. Execute fulfillment with Digiflazz API
                    const result = await digiflazz.topup(data.sku, data.target, refId);
                    
                    if (result.status === 'Gagal') {
                        // Release reservation if Digiflazz fails (Instant Auto-Refund)
                        await db.releaseReservation(userId, data.price).catch(() => {});
                        db.updateTransaction(refId, { status: 'failed', note: result.message });
                        return sock.reply(chat, `❌ *Transaksi Gagal:*\n${result.message || 'Ditolak oleh provider'}\n\nSaldo Anda telah dikembalikan secara otomatis.`, m);
                    }

                    // 3. Commit debit and record order in FENBOT CLOUD
                    await db.commitDebit(userId, data.price);
                    const updatedUser = await db.getUserAsync(userId);
                    const trxRecord = {
                        user: userId, sku: data.sku, product_name: data.product_name, target: data.target,
                        price: data.price, modal: data.modal, balance_before: data.balance_before,
                        balance_after: updatedUser.balance, status: (result.status || 'pending').toLowerCase(),
                        note: result.message || '', chat: data.chat || chat, sn: result.sn || ''
                    };
                    db.addTransaction(refId, trxRecord);

                    // 4. Kirim respon status ke pembeli
                    if (result.status === 'Sukses') {
                        const gsheets = require('./lib/gsheets');
                        const { createInvoice } = require('./lib/invoice');
                        gsheets.sendToSheet({ ...trxRecord, status: 'success', sn: result.sn });

                        let successMsg = `🎉 *TRANSAKSI BERHASIL* 🎉\n\n`;
                        successMsg += `📝 *Detail Transaksi*\n`;
                        successMsg += `▸ *Order ID :* ${refId}\n`;
                        successMsg += `▸ *Produk   :* ${data.product_name}\n`;
                        successMsg += `▸ *Tujuan   :* ${data.target}\n`;
                        successMsg += `▸ *Status   :* ✅ SUKSES\n`;
                        successMsg += `▸ *SN/Ref   :* ${result.sn || '-'}\n\n`;
                        successMsg += `💳 *Informasi Saldo*\n`;
                        successMsg += `▸ *Harga    :* Rp${data.price.toLocaleString('id-ID')}\n`;
                        successMsg += `▸ *Sisa Saldo:* Rp${updatedUser.balance.toLocaleString('id-ID')}\n\n`;
                        successMsg += `_Terima kasih telah berbelanja!_ 🙏`;

                        let isImageSent = false;
                        try {
                            const invPath = await createInvoice({ ...trxRecord, sn: result.sn, nickname: result.customer_name });
                            if (invPath && fs.existsSync(invPath)) {
                                const imgBuffer = fs.readFileSync(invPath);
                                await sock.sendMessage(chat, { image: imgBuffer, caption: successMsg });
                                isImageSent = true;
                            }
                        } catch (e) {
                            console.error('[ ERROR ] Gagal membuat struk:', e.message);
                        }

                        if (!isImageSent) {
                            await sock.reply(chat, successMsg, m);
                        }
                    } else {
                        // Status PENDING
                        let pendingMsg = `⏳ *TRANSAKSI SEDANG DIPROSES* ⏳\n\n`;
                        pendingMsg += `📝 *Detail Transaksi*\n`;
                        pendingMsg += `▸ *Order ID :* ${refId}\n`;
                        pendingMsg += `▸ *Produk   :* ${data.product_name}\n`;
                        pendingMsg += `▸ *Tujuan   :* ${data.target}\n`;
                        pendingMsg += `▸ *Status   :* ⏳ PENDING / PROSES\n`;
                        pendingMsg += `▸ *Pesan    :* ${result.message || 'Sedang diproses oleh provider'}\n\n`;
                        pendingMsg += `💳 *Informasi Saldo*\n`;
                        pendingMsg += `▸ *Harga    :* Rp${data.price.toLocaleString('id-ID')}\n`;
                        pendingMsg += `▸ *Sisa Saldo:* Rp${updatedUser.balance.toLocaleString('id-ID')}\n\n`;
                        pendingMsg += `_Pesanan sedang diantrekan ke provider. Bukti struk/laporan sukses akan dikirimkan otomatis setelah transaksi selesai._ 🚀`;

                        await sock.reply(chat, pendingMsg, m);
                    }
                } catch (err) {
                    await db.releaseReservation(userId, data.price).catch(() => {});
                    db.updateTransaction(refId, { status: 'failed', note: err.message || 'Kesalahan sistem' });
                    return sock.reply(chat, `❌ Kesalahan sistem: Gagal memproses pesanan (${err.message || 'Error'}). Saldo dikembalikan.`, m);
                }
                return;
            }
        }

        if (!isExecuted && body && body.toLowerCase() === "halo") {
            return sock.reply(chat, "Halo juga!", m);
        }

    } catch (err) {
        console.log(chalk.red("[ ERROR ] " + err));
    }
};
