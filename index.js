const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    Browsers
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const chalk = require("chalk");
const { Boom } = require("@hapi/boom");
const fs = require("fs-extra");
const http = require("http");
const readline = require("readline");
const { serialize, decodeJid } = require("./lib/serializer");
const lidHelper = require("./lib/lidHelper");
const config = require("./config/config");
const { getWIBTime } = require("./lib/helper");
const qrcode = require("qrcode-terminal");
const db = require("./lib/db");
const fenbot = require("./lib/fenbot");

const question = (text) => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise((resolve) => {
        rl.question(text, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
};

const messageCache = new Set();
let botStatus = {
    connected: false,
    startedAt: new Date().toISOString(),
    phone: ''
};

const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
    if (req.url === '/api/status' || req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        const dbData = db.readDB();
        return res.end(JSON.stringify({
            status: 'ok',
            bot: botStatus.connected ? 'connected' : 'connecting',
            time: getWIBTime(),
            products: (dbData.products || []).length,
            users: Object.keys(dbData.users || {}).length
        }));
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    const dbData = db.readDB();
    const html = `<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${config.botName || 'Bot Store'} - Status</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 24px; }
        .card { max-width: 640px; margin: 40px auto; background: #1e293b; border-radius: 12px; padding: 28px; box-shadow: 0 10px 25px rgba(0,0,0,0.3); border: 1px solid #334155; }
        h1 { margin-top: 0; font-size: 24px; color: #38bdf8; }
        .status-badge { display: inline-block; padding: 6px 14px; border-radius: 20px; font-weight: bold; font-size: 14px; background: ${botStatus.connected ? '#166534; color: #86efac' : '#854d0e; color: #fde047'}; }
        .stats-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; margin-top: 20px; }
        .stat-item { background: #0f172a; padding: 14px; border-radius: 8px; border: 1px solid #334155; }
        .stat-label { font-size: 12px; color: #94a3b8; }
        .stat-val { font-size: 18px; font-weight: bold; margin-top: 4px; color: #f1f5f9; }
        .footer { margin-top: 24px; font-size: 12px; color: #64748b; text-align: center; }
    </style>
</head>
<body>
    <div class="card">
        <h1>${config.storeName || 'Store Bot'}</h1>
        <p>WhatsApp Bot Management &amp; Gateway H2H Digiflazz</p>
        <div>
            Status: <span class="status-badge">${botStatus.connected ? 'ONLINE / CONNECTED' : 'INITIALIZING / CONNECTING'}</span>
        </div>
        <div class="stats-grid">
            <div class="stat-item"><div class="stat-label">WAKTU SERVER</div><div class="stat-val">${getWIBTime()} WIB</div></div>
            <div class="stat-item"><div class="stat-label">TOTAL PRODUK</div><div class="stat-val">${(dbData.products || []).length} SKU</div></div>
            <div class="stat-item"><div class="stat-label">TOTAL PENGGUNA</div><div class="stat-val">${Object.keys(dbData.users || {}).length} User</div></div>
            <div class="stat-item"><div class="stat-label">BOT NUMBER</div><div class="stat-val">${botStatus.phone || '-'}</div></div>
        </div>
        <div class="footer">Server berjalan aktif pada port ${PORT}</div>
    </div>
</body>
</html>`;
    res.end(html);
});

server.listen(PORT, () => {
    console.log(chalk.cyan(`[ WEB ] Server berjalan di http://localhost:${PORT}`));
});

async function startBot() {
    if (process.env.NODE_ENV === "production" || process.env.STRICT_FENBOT_ENV === "true") {
        const { fenbotClient } = require("./lib/fenbot-client");
        try {
            fenbotClient.assertConfigured();
        } catch (cfgErr) {
            console.error(chalk.red.bold(`[ FATAL CONFIG ERROR ] ${cfgErr.message}`));
            process.exit(1);
        }
    }

    await fenbot.syncSettings(config);
    // 0. Pulihkan sesi WhatsApp dari Cloud Storage FENBOT sebelum useMultiFileAuthState (Zero Re-scan)
    await fenbot.restoreSession("session");
    const { state, saveCreds } = await useMultiFileAuthState("session");
    const { version } = await fetchLatestBaileysVersion();

    const logger = pino({ level: "silent" });

    const sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: false,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        browser: Browsers.ubuntu("Chrome"),
        syncFullHistory: false,
        markOnline: true,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 10000,
        getMessage: async () => {
            return { conversation: "" };
        },
    });

    const autoSyncPricelist = async () => {
        try {
            const digiflazz = require('./lib/digiflazz');
            if (config.digiflazz.apiKey && config.digiflazz.apiKey !== 'YOUR_API_KEY') {
                const products = await digiflazz.getPriceList();
                if (products && Array.isArray(products)) {
                    db.updateProducts(products);
                    console.log(chalk.green(`[ AUTO-SYNC ] Berhasil memperbarui ${products.length} produk Digiflazz.`));
                }
            }
        } catch (err) {
            console.log(chalk.red(`[ AUTO-SYNC ] Gagal: ${err.message}`));
        }
    };

    sock.ev.on("creds.update", saveCreds);

    let loginChoice = null;

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr && (loginChoice === "1" || !loginChoice || !process.stdin.isTTY)) {
            console.log(chalk.blue("[ INFO ] Scan QR Code di bawah untuk login:"));
            qrcode.generate(qr, { small: true });
            await fenbot.sendWhatsAppStatus('CONNECTING', { qrString: qr });
        }

        if (connection === "close") {
            botStatus.connected = false;
            await fenbot.sendWhatsAppStatus('DISCONNECTED');
            let reason = new Boom(lastDisconnect?.error)?.output.statusCode;
            console.log(chalk.yellow(`[ CONNECT ] Connection closed. Reason: ${reason}`));

            if (reason === DisconnectReason.loggedOut) {
                console.log(chalk.red("[ CONNECT ] Device Logged Out. Cleaning session and restarting..."));
                await fs.remove("session").catch(() => { });
                setTimeout(() => startBot(), 5000);
            } else if (reason === DisconnectReason.restartRequired) {
                console.log(chalk.blue("[ CONNECT ] Restart Required. Restarting..."));
                startBot();
            } else if (reason === DisconnectReason.timedOut) {
                console.log(chalk.red("[ CONNECT ] Connection Timed Out. Reconnecting..."));
                setTimeout(() => startBot(), 5000);
            } else {
                console.log(chalk.yellow(`[ CONNECT ] Reconnecting in 5s...`));
                setTimeout(() => startBot(), 5000);
            }
        } else if (connection === "open") {
            botStatus.connected = true;
            botStatus.phone = decodeJid(sock.user?.id || '');
            await fenbot.sendWhatsAppStatus('CONNECTED', { phoneNumber: botStatus.phone });

            if (sock.user?.id && sock.user?.lid) {
                lidHelper.registerMapping(sock.user.lid, sock.user.id);
            }

            console.log(chalk.green.bold("\n[ CONNECT ] Connected to WhatsApp"));
            console.log(chalk.white(`[ TIME ] ${getWIBTime()} WIB\n`));

            // Mulai Liveness Heartbeat & Auto Session Backup untuk FENBOT Cloud
            fenbot.startHeartbeat(() => botStatus);
            fenbot.startSessionSync("session");

            try {
                const groups = await sock.groupFetchAllParticipating();
                for (const g of Object.values(groups)) {
                    lidHelper.extractFromGroupMetadata(g);
                }
            } catch { }

            autoSyncPricelist();
            setInterval(autoSyncPricelist, 12 * 60 * 60 * 1000);
        }
    });

    sock.ev.on("chats.phoneNumberShare", ({ lid, jid }) => {
        lidHelper.registerMapping(lid, jid);
    });

    sock.ev.on("contacts.upsert", (contacts) => {
        if (!Array.isArray(contacts)) return;
        for (const c of contacts) {
            if (c.lid && (c.jid || c.id)) {
                lidHelper.registerMapping(c.lid, c.jid || c.id);
            }
        }
    });

    sock.ev.on("contacts.update", (contacts) => {
        if (!Array.isArray(contacts)) return;
        for (const c of contacts) {
            if (c.lid && c.id) {
                lidHelper.registerMapping(c.lid, c.id);
            }
        }
    });

    sock.ev.on("groups.update", (groups) => {
        if (!Array.isArray(groups)) return;
        for (const g of groups) {
            lidHelper.extractFromGroupMetadata(g);
        }
    });

    if (!sock.authState.creds.registered) {
        const envPhone = process.env.PAIRING_NUMBER || process.env.WA_PHONE || process.env.PHONE_NUMBER;
        const envMethod = process.env.LOGIN_METHOD || (envPhone ? "2" : "");

        if (envMethod === "2" && envPhone) {
            loginChoice = "2";
            const cleanPhone = envPhone.replace(/[^0-9]/g, "");
            console.log(chalk.cyan.bold(`\n[ LOGIN ] Mode Pairing Otomatis untuk nomor: ${cleanPhone}`));
            try {
                const code = await sock.requestPairingCode(cleanPhone);
                console.log(chalk.green.bold(`\nPairing Code Anda: ${code}\n`));
                console.log(chalk.white("Masukkan kode di atas pada WhatsApp Anda (Link with Device > Link with Phone Code)\n"));
                await fenbot.sendWhatsAppStatus('CONNECTING', { pairingCode: code, phoneNumber: cleanPhone });
            } catch (err) {
                console.error(chalk.red(`[ PAIRING ERROR ] Gagal meminta pairing code: ${err.message}`));
            }
        } else if (!process.stdin.isTTY || process.env.HEADLESS === "true") {
            loginChoice = "1";
            console.log(chalk.blue("\n[ INFO ] Menjalankan mode container / headless, menunggu QR Code..."));
        } else {
            console.log(chalk.cyan.bold("\n[ LOGIN ] Pilih metode login:"));
            console.log(chalk.white("1. QR Code"));
            console.log(chalk.white("2. Pairing Code"));

            loginChoice = await question(chalk.yellow("Masukkan pilihan (1/2): "));

            if (loginChoice === "2") {
                const phoneNumber = await question(chalk.yellow("Masukkan nomor WhatsApp (contoh: 628xxx): "));
                if (!phoneNumber) {
                    console.log(chalk.red("[ ERROR ] Nomor tidak boleh kosong!"));
                    process.exit();
                }
                const cleanNum = phoneNumber.replace(/[^0-9]/g, '');
                const code = await sock.requestPairingCode(cleanNum);
                console.log(chalk.green.bold(`\nPairing Code Anda: ${code}\n`));
                console.log(chalk.white("Masukkan kode di atas pada WhatsApp Anda (Link with Device > Link with Phone Code)\n"));
                await fenbot.sendWhatsAppStatus('CONNECTING', { pairingCode: code, phoneNumber: cleanNum });
            } else if (loginChoice === "1") {
                console.log(chalk.blue("\n[ INFO ] Menunggu QR Code muncul..."));
            } else {
                console.log(chalk.red("[ ERROR ] Pilihan tidak valid, default ke QR Code!"));
                loginChoice = "1";
            }
        }

        // Listener perintah konsol untuk trigger pairing code langsung dari Pterodactyl Command
        const consoleRl = readline.createInterface({ input: process.stdin });
        consoleRl.on("line", async (line) => {
            const trimmed = (line || '').trim();
            if (trimmed.startsWith("pair ") && !sock.authState.creds.registered) {
                const targetPhone = trimmed.replace("pair ", "").trim().replace(/[^0-9]/g, "");
                if (targetPhone) {
                    try {
                        const pCode = await sock.requestPairingCode(targetPhone);
                        console.log(chalk.green.bold(`\n[ PAIR ] Pairing Code: ${pCode} untuk ${targetPhone}\n`));
                        await fenbot.sendWhatsAppStatus('CONNECTING', { pairingCode: pCode, phoneNumber: targetPhone });
                    } catch (pErr) {
                        console.error(chalk.red(`[ PAIR ERROR ] ${pErr.message}`));
                    }
                }
            }
        });
    }
    const startTime = Math.floor(Date.now() / 1000);

    sock.ev.on("messages.upsert", async (chatUpdate) => {
        try {
            if (chatUpdate.type !== 'notify') return;
            const mek = chatUpdate.messages[0];
            if (!mek.message) return;

            if (mek.messageTimestamp < startTime) return;

            const messageId = mek.key.id;
            if (messageCache.has(messageId)) return;
            messageCache.add(messageId);

            if (messageCache.size > 100) {
                const firstItem = messageCache.values().next().value;
                messageCache.delete(firstItem);
            }

            lidHelper.extractFromMessage(sock, mek);
            await sock.readMessages([mek.key]);
            const m = serialize(sock, mek);
            require("./message")(sock, m);

        } catch (err) {
            console.log(chalk.red("[ ERROR ] " + err));
        }
    });

    sock.ev.on("group-participants.update", async (update) => {
        require('./lib/welcome')(sock, update);
    });

    setInterval(async () => {
        const digiflazz = require('./lib/digiflazz');
        const data = db.readDB();
        const pendingTrx = Object.values(data.transactions).filter(t => t.status === 'pending');

        if (pendingTrx.length === 0) return;

        console.log(chalk.blue(`[ LOOP ] Checking ${pendingTrx.length} pending transactions...`));

        for (const trx of pendingTrx) {
            try {
                const statusUpdate = await digiflazz.checkStatus(trx.sku, trx.target, trx.id);

                if (statusUpdate.status === 'Sukses') {
                    const gsheets = require('./lib/gsheets');
                    const { createInvoice } = require('./lib/invoice');
                    db.updateTransaction(trx.id, { status: 'success', sn: statusUpdate.sn });
                    gsheets.sendToSheet({ ...trx, status: 'success', sn: statusUpdate.sn });

                    let notifyJid = lidHelper.toJid(trx.chat || trx.user);
                    let successMsg = `🎉 *TRANSAKSI BERHASIL* 🎉\n\n`;
                    successMsg += `📝 *Detail Transaksi*\n`;
                    successMsg += `▸ *Order ID :* ${trx.id}\n`;
                    successMsg += `▸ *Produk   :* ${trx.product_name}\n`;
                    successMsg += `▸ *Tujuan   :* ${trx.target}\n`;
                    successMsg += `▸ *Status   :* ✅ SUKSES\n`;
                    successMsg += `▸ *SN/Ref   :* ${statusUpdate.sn}\n\n`;
                    successMsg += `💳 *Informasi Saldo*\n`;
                    successMsg += `▸ *Harga    :* Rp${trx.price.toLocaleString()}\n`;
                    successMsg += `▸ *Sisa Saldo:* Rp${trx.balance_after.toLocaleString()}\n\n`;
                    successMsg += `_Terima kasih telah berbelanja!_ 🙏`;

                    let isImageSent = false;
                    const invPath = await createInvoice({ ...trx, sn: statusUpdate.sn, nickname: statusUpdate.customer_name });
                    if (invPath) {
                        try {
                            const imgBuffer = fs.readFileSync(invPath);
                            await sock.sendMessage(notifyJid, { image: imgBuffer, caption: successMsg });
                            isImageSent = true;
                        } catch (e) {
                            console.error('[ ERROR ] Gagal mengirim gambar struk', e);
                        }
                    }
                    
                    if (!isImageSent) {
                        await sock.sendMessage(notifyJid, { text: successMsg });
                    }

                    try {
                        const targetUserJid = lidHelper.toJid(trx.user);
                        let ownerSuccessMsg = `🟢 *TRANSAKSI BERHASIL (Laporan)* 🟢\n\n`;
                        ownerSuccessMsg += `▸ *Order ID:* ${trx.id}\n`;
                        ownerSuccessMsg += `▸ *User:* @${targetUserJid.split('@')[0]}\n`;
                        ownerSuccessMsg += `▸ *Produk:* ${trx.product_name}\n`;
                        ownerSuccessMsg += `▸ *Tujuan:* ${trx.target}\n`;
                        ownerSuccessMsg += `▸ *SN:* ${statusUpdate.sn}\n\n`;
                        ownerSuccessMsg += `💰 *Keuangan*\n`;
                        ownerSuccessMsg += `▸ *Harga Modal:* Rp${trx.modal.toLocaleString()}\n`;
                        ownerSuccessMsg += `▸ *Harga Jual:* Rp${trx.price.toLocaleString()}\n`;
                        ownerSuccessMsg += `▸ *Profit:* Rp${(trx.price - trx.modal).toLocaleString()}\n`;
                        
                        for (let o of config.owner) {
                            const ownerJid = lidHelper.toJid(o);
                            await sock.sendMessage(ownerJid, { text: ownerSuccessMsg, mentions: [targetUserJid] });
                        }
                    } catch (e) { console.error('[ ERROR ] Gagal mengirim laporan sukses ke owner', e); }

                } else if (statusUpdate.status === 'Gagal') {
                    try {
                        await db.creditBalance(trx.user, trx.price, `refund_${trx.id}`);
                    } catch (refErr) {
                        console.error('[ REFUND ERROR ] Gagal memproses refund cloud:', refErr.message);
                    }
                    const updatedUser = await db.getUserAsync(trx.user);
                    const refundedBalance = updatedUser.balance;
                    db.updateTransaction(trx.id, { status: 'failed', note: statusUpdate.message });

                    let notifyJid = lidHelper.toJid(trx.chat || trx.user);
                    let failMsg = `⚠️ *TRANSAKSI GAGAL* ⚠️\n\n`;
                    failMsg += `📝 *Detail Transaksi*\n`;
                    failMsg += `▸ *Order ID :* ${trx.id}\n`;
                    failMsg += `▸ *Produk   :* ${trx.product_name}\n`;
                    failMsg += `▸ *Tujuan   :* ${trx.target}\n`;
                    failMsg += `▸ *Status   :* ❌ GAGAL\n`;
                    failMsg += `▸ *Alasan   :* ${statusUpdate.message}\n\n`;
                    failMsg += `💳 *Refund Saldo*\n`;
                    failMsg += `▸ *Saldo Kembali:* Rp${trx.price.toLocaleString()}\n`;
                    failMsg += `▸ *Total Saldo  :* Rp${refundedBalance.toLocaleString()}\n\n`;
                    failMsg += `_Saldo Anda telah dikembalikan secara otomatis._ 🔄`;

                    sock.sendMessage(notifyJid, { text: failMsg });

                    try {
                        const targetUserJid = lidHelper.toJid(trx.user);
                        let ownerFailMsg = `🔴 *TRANSAKSI GAGAL (Laporan)* 🔴\n\n`;
                        ownerFailMsg += `▸ *Order ID:* ${trx.id}\n`;
                        ownerFailMsg += `▸ *User:* @${targetUserJid.split('@')[0]}\n`;
                        ownerFailMsg += `▸ *Produk:* ${trx.product_name}\n`;
                        ownerFailMsg += `▸ *Tujuan:* ${trx.target}\n`;
                        ownerFailMsg += `▸ *Alasan:* ${statusUpdate.message}\n\n`;
                        ownerFailMsg += `_Sistem telah mengembalikan saldo sebesar Rp${trx.price.toLocaleString()} ke user._`;
                        
                        for (let o of config.owner) {
                            const ownerJid = lidHelper.toJid(o);
                            await sock.sendMessage(ownerJid, { text: ownerFailMsg, mentions: [targetUserJid] });
                        }
                    } catch (e) { console.error('[ ERROR ] Gagal mengirim laporan gagal ke owner', e); }
                }
            } catch (err) {
                // Ignore transient network errors
            }
        }
    }, 30000);

    // Graceful termination handling: sync session and shutdown cleanly
    const handleShutdown = async (signal) => {
        console.log(chalk.yellow(`\n[ SHUTDOWN ] Menerima ${signal}. Menyinkronkan sesi WhatsApp ke Cloud...`));
        try {
            await fenbot.syncSession("session");
            await fenbot.sendWhatsAppStatus("DISCONNECTED");
        } catch {}
        process.exit(0);
    };

    process.on("SIGINT", () => handleShutdown("SIGINT"));
    process.on("SIGTERM", () => handleShutdown("SIGTERM"));

    return sock;
}

startBot();
