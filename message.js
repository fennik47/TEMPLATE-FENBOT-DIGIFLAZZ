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
        const isOwner = config.owner.some(v => {
            const vClean = v.toString().replace(/[^0-9]/g, '');
            return (vClean.length >= 8 && senderDigits.endsWith(vClean.slice(-8))) || lidHelper.toJid(v) === sender;
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
                m.groupMetadata = await sock.groupMetadata(chat);
                lidHelper.extractFromGroupMetadata(m.groupMetadata);
                m.participants = (m.groupMetadata.participants || []).map(p => ({
                    ...p,
                    jid: lidHelper.toJid(p.jid || p.id),
                    id: lidHelper.toJid(p.id)
                }));
                m.groupAdmins = m.groupMetadata.participants.filter(p => p.admin).map(p => lidHelper.toJid(p.jid || p.id));
                const botNumber = decodeJid(sock?.user?.id || "").split('@')[0];
                const senderNumber = sender.split('@')[0];
                
                m.isBotAdmin = botNumber ? m.groupAdmins.some(adminJid => adminJid.split('@')[0] === botNumber) : false;
                m.isAdmin = senderNumber ? m.groupAdmins.some(adminJid => adminJid.split('@')[0] === senderNumber) : false;
            } catch (e) {
                // Ignore metadata fetch error if bot just joined or network lagged
            }
        }

        const userId = sender;
        const isReg = db.isRegistered(userId);
        const commandFiles = fs.readdirSync(path.join(__dirname, "commands")).filter(file => file.endsWith(".js"));
        let isExecuted = false;

        if (isCmd && !isReg && command !== 'daftar' && !isOwner) {
            return sock.reply(chat, `🚫 *AKSES DITOLAK*\n\nMaaf, Anda harus terdaftar untuk menggunakan fitur bot ini.\n\nSilakan ketik *.daftar NamaAnda* untuk mendaftar.`, m);
        }

        for (const file of commandFiles) {
            const cmd = require(`./commands/${file}`);
            if (cmd.name === command || (cmd.aliases && cmd.aliases.includes(command))) {
                isExecuted = true;
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

        if (body && (body.toLowerCase() === "ya" || body.toLowerCase() === "tidak")) {
            if (global.pendingTopup && global.pendingTopup[sender]) {
                const data = global.pendingTopup[sender];
                if (Date.now() - data.timestamp > 300000) {
                    delete global.pendingTopup[sender];
                    return sock.reply(chat, "⏰ Waktu konfirmasi telah habis (5 menit).", m);
                }
                delete global.pendingTopup[sender];
                if (body.toLowerCase() === "tidak") return sock.reply(chat, "❌ Pesanan dibatalkan.", m);

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
                        await db.releaseReservation(userId, data.price);
                        db.updateTransaction(refId, { status: 'failed', note: result.message });
                        return sock.reply(chat, `❌ Gagal: ${result.message}\nSaldo Anda telah dikembalikan secara otomatis.`, m);
                    }

                    // 3. Commit debit and record order in FENBOT CLOUD
                    await db.commitDebit(userId, data.price);
                    const updatedUser = await db.getUserAsync(userId);
                    db.addTransaction(refId, {
                        user: userId, sku: data.sku, product_name: data.product_name, target: data.target,
                        price: data.price, modal: data.modal, balance_before: data.balance_before,
                        balance_after: updatedUser.balance, status: result.status.toLowerCase(),
                        note: result.message, chat: data.chat || chat
                    });
                } catch (err) {
                    await db.releaseReservation(userId, data.price);
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
