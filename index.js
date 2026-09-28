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

const messageCache = new Set();
let globalSock = null;
let currentQrString = null;
let botStatus = {
    connected: false,
    startedAt: new Date().toISOString(),
    phone: ''
};

/**
 * Pemrosesan deposit lunas dengan proteksi mutex & idempotency
 */
async function processPaidDeposit(deposit, payload = {}, source = 'webhook') {
    if (!deposit || deposit.status === 'paid' || deposit.isProcessing) return false;
    deposit.isProcessing = true;

    const refNo = deposit.ref_no || deposit.id;
    const amount = Number(deposit.amount);
    const userJid = deposit.user;
    const idempotencyKey = `dep_credit_${deposit.id || refNo}`;

    console.log(chalk.green(`[ MUSTIKAPAY ] Memproses pembayaran lunas untuk Ref: ${refNo}, User: ${userJid}, Rp${amount.toLocaleString()} via ${source}`));

    try {
        await db.creditBalance(userJid, amount, idempotencyKey);
    } catch (creditErr) {
        console.error('[ MUSTIKAPAY ] Gagal creditBalance ke FENBOT CLOUD:', creditErr.message);
    }

    db.updateDeposit(refNo, {
        status: 'paid',
        paidAt: new Date().toISOString(),
        isProcessing: false,
        settledVia: source,
        gatewayData: payload
    });

    const updatedUser = await db.getUserAsync(userJid);
    const finalBalance = updatedUser ? updatedUser.balance : 0;

    if (globalSock) {
        try {
            const notifyJid = lidHelper.toJid(deposit.chat || userJid);
            let msg = `🎉 *DEPOSIT QRIS BERHASIL* 🎉\n\n`;
            msg += `📝 *Detail Pembayaran*\n`;
            msg += `▸ *Ref ID     :* ${refNo}\n`;
            msg += `▸ *Nominal    :* Rp${amount.toLocaleString()}\n`;
            msg += `▸ *Status     :* ✅ LUNAS / PAID\n`;
            msg += `▸ *Total Saldo:* Rp${finalBalance.toLocaleString()}\n\n`;
            msg += `_Saldo telah berhasil ditambahkan ke akun Anda. Selamat berbelanja!_ 🚀`;

            await globalSock.sendMessage(notifyJid, { text: msg });
        } catch (msgErr) {
            console.error('[ MUSTIKAPAY ] Gagal kirim notifikasi user:', msgErr.message);
        }

        try {
            const targetUserJid = lidHelper.toJid(userJid);
            let ownerMsg = `🟢 *DEPOSIT QRIS MASUK (Laporan)* 🟢\n\n`;
            ownerMsg += `▸ *Ref ID :* ${refNo}\n`;
            ownerMsg += `▸ *User   :* @${targetUserJid.split('@')[0]}\n`;
            ownerMsg += `▸ *Nominal:* Rp${amount.toLocaleString()}\n`;
            ownerMsg += `▸ *Metode :* MustikaPay QRIS (${source})\n`;

            for (let o of config.owner) {
                const ownerJid = lidHelper.toJid(o);
                await globalSock.sendMessage(ownerJid, { text: ownerMsg, mentions: [targetUserJid] });
            }
        } catch (ownerErr) {
            console.error('[ MUSTIKAPAY ] Gagal kirim laporan owner:', ownerErr.message);
        }
    }

    return true;
}

/**
 * Pemrosesan pembelian produk Digiflazz langsung bayar via QRIS (Anti-Race Condition & Concurrency Safe)
 * Siklus Status: pending -> paid -> process -> sukses / failed (auto-refund ke saldo bot cloud)
 */
async function processPaidQrisOrder(order, payload = {}, source = 'webhook') {
    if (!order || order.status !== 'pending' || order.isProcessing) return false;
    order.isProcessing = true;

    const refNo = order.ref_no || order.id;
    const orderId = order.id;
    const amount = Number(order.price);
    const userJid = order.user;
    const idempotencyKey = `qris_order_credit_${orderId}`;

    console.log(chalk.green(`[ MUSTIKAPAY QRIS BUY ] Pembayaran terverifikasi untuk Order: ${orderId}, Ref: ${refNo}, User: ${userJid}, Produk: ${order.product_name} via ${source}`));

    // 1. Audit penambahan dana masuk (QRIS) ke PostgreSQL FENBOT CLOUD
    try {
        await db.creditBalance(userJid, amount, idempotencyKey);
    } catch (creditErr) {
        console.error('[ MUSTIKAPAY QRIS BUY ] Gagal kredit saldo cloud:', creditErr.message);
    }

    // 2. Update status order menjadi 'process'
    db.updateQrisOrder(refNo, {
        status: 'process',
        paidAt: new Date().toISOString(),
        settledVia: source,
        gatewayData: payload
    });

    const notifyJid = lidHelper.toJid(order.chat || userJid);

    if (globalSock) {
        try {
            let procMsg = `🎉 *PEMBAYARAN QRIS DITERIMA!* 🎉\n\n`;
            procMsg += `• Order ID : *${orderId}*\n`;
            procMsg += `• Produk   : *${order.product_name}*\n`;
            procMsg += `• Tujuan   : *${order.target}*\n`;
            procMsg += `• Status   : ⏳ *PROCESS (Sedang Dikirim)*\n\n`;
            procMsg += `_Sistem sedang memproses pengisian ke nomor tujuan Anda. Mohon tunggu sebentar..._ ⚡`;
            await globalSock.sendMessage(notifyJid, { text: procMsg });
        } catch {}
    }

    // 3. Eksekusi pengisian ke Digiflazz
    const digiflazz = require('./lib/digiflazz');
    try {
        // Kunci saldo via ACID row reservation
        await db.reserveBalance(userJid, amount);

        const result = await digiflazz.topup(order.sku, order.target, orderId);

        if (result.status === 'Gagal') {
            // Provider gagal -> Lepaskan reservasi agar uang tetap aman di saldo bot user di Cloud (Instant Auto-Refund)
            await db.releaseReservation(userJid, amount);
            db.updateQrisOrder(refNo, {
                status: 'failed',
                note: result.message,
                isProcessing: false
            });

            const updatedUser = await db.getUserAsync(userJid);
            if (globalSock) {
                let failMsg = `⚠️ *PENGISIAN PRODUK GAGAL (AUTO-REFUND)* ⚠️\n\n`;
                failMsg += `• Order ID : *${orderId}*\n`;
                failMsg += `• Produk   : *${order.product_name}*\n`;
                failMsg += `• Tujuan   : *${order.target}*\n`;
                failMsg += `• Alasan   : ${result.message}\n\n`;
                failMsg += `💳 *Dana Masuk ke Saldo Bot Anda*\n`;
                failMsg += `Karena Anda telah membayar via QRIS, dana sebesar *Rp${amount.toLocaleString()}* telah otomatis dimasukkan ke *Saldo Bot* Anda di Cloud.\n`;
                failMsg += `▸ *Saldo Anda Sekarang:* Rp${(updatedUser ? updatedUser.balance : 0).toLocaleString()}\n\n`;
                failMsg += `_Anda dapat menggunakan saldo ini kapan saja via *.buy* atau menariknya._ 🔄`;
                await globalSock.sendMessage(notifyJid, { text: failMsg });
            }
            return true;
        }

        // Provider respon 'Pending' atau 'Sukses' -> Commit debit di Cloud
        await db.commitDebit(userJid, amount);
        const updatedUser = await db.getUserAsync(userJid);

        db.updateQrisOrder(refNo, {
            status: result.status.toLowerCase(),
            sn: result.sn || '',
            isProcessing: false
        });

        // Daftarkan ke transactions DB agar loop pending Digiflazz otomatis mengawasi hingga sukses/invoice
        db.addTransaction(orderId, {
            user: userJid,
            sku: order.sku,
            product_name: order.product_name,
            target: order.target,
            price: amount,
            modal: order.modal,
            balance_before: updatedUser ? updatedUser.balance + amount : amount,
            balance_after: updatedUser ? updatedUser.balance : 0,
            status: result.status.toLowerCase(),
            sn: result.sn || '',
            note: result.message,
            chat: order.chat
        });

        if (result.status === 'Sukses') {
            const gsheets = require('./lib/gsheets');
            const { createInvoice } = require('./lib/invoice');
            gsheets.sendToSheet({ ...order, status: 'success', sn: result.sn });

            let successMsg = `🎉 *TRANSAKSI BERHASIL (QRIS OTOMATIS)* 🎉\n\n`;
            successMsg += `📝 *Detail Pembelian*\n`;
            successMsg += `▸ *Order ID :* ${orderId}\n`;
            successMsg += `▸ *Produk   :* ${order.product_name}\n`;
            successMsg += `▸ *Tujuan   :* ${order.target}\n`;
            successMsg += `▸ *Status   :* ✅ SUKSES\n`;
            successMsg += `▸ *SN/Ref   :* ${result.sn || '-'}\n\n`;
            successMsg += `_Terima kasih telah berbelanja!_ 🙏`;

            if (globalSock) {
                let isImageSent = false;
                try {
                    const invPath = await createInvoice({ ...order, sn: result.sn, nickname: result.customer_name });
                    if (invPath && fs.existsSync(invPath)) {
                        const imgBuffer = fs.readFileSync(invPath);
                        await globalSock.sendMessage(notifyJid, { image: imgBuffer, caption: successMsg });
                        isImageSent = true;
                    }
                } catch {}
                if (!isImageSent) {
                    await globalSock.sendMessage(notifyJid, { text: successMsg });
                }
            }
        }
    } catch (err) {
        await db.releaseReservation(userJid, amount).catch(() => {});
        db.updateQrisOrder(refNo, {
            status: 'failed',
            note: err.message || 'Kesalahan sistem provider',
            isProcessing: false
        });
    }

    return true;
}

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
            users: Object.keys(dbData.users || {}).length,
            deposits: Object.keys(dbData.deposits || {}).length,
            qris_orders: Object.keys(dbData.qris_orders || {}).length
        }));
    }

    // Endpoint status QR Code untuk FENBOT Cloud Website Dashboard
    if (req.url === '/api/qr' || req.url === '/api/login/qr') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
            status: botStatus.connected ? 'connected' : (currentQrString ? 'qr_ready' : 'waiting'),
            qr: currentQrString || null
        }));
    }

    // Endpoint Request Pairing Code dari FENBOT Cloud Website Dashboard
    if (req.url === '/api/pairing' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
            try {
                const data = JSON.parse(body || '{}');
                const phone = (data.phone || data.phoneNumber || data.nomor || '').toString().replace(/[^0-9]/g, '');
                if (!phone) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ status: 'error', message: 'Nomor telepon tidak boleh kosong' }));
                }
                if (globalSock && !globalSock.authState.creds.registered) {
                    const code = await globalSock.requestPairingCode(phone);
                    console.log(chalk.green.bold(`\n[ PAIRING CLOUD ] Pairing Code: ${code} untuk ${phone}\n`));
                    await fenbot.sendWhatsAppStatus('CONNECTING', { pairingCode: code, phoneNumber: phone });
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ status: 'ok', pairingCode: code, phoneNumber: phone }));
                } else {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ status: 'error', message: 'Bot sudah terhubung atau socket belum siap' }));
                }
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ status: 'error', message: err.message }));
            }
        });
        return;
    }

    // Webhook Endpoint MustikaPay
    if (req.url === '/api/mustikapay/callback' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
            const mustikapay = require('./lib/mustikapay');
            const signature = req.headers['x-signature'] || req.headers['signature'] || '';
            let parsed = {};
            try {
                parsed = JSON.parse(body);
            } catch {
                try {
                    const qs = require('querystring');
                    parsed = qs.parse(body);
                } catch {}
            }

            console.log(chalk.blue(`[ MUSTIKAPAY WEBHOOK ] Diterima callback:`), JSON.stringify(parsed));

            if (signature && mustikapay.apiKey) {
                const isValid = mustikapay.verifyCallback(body, signature);
                if (!isValid) {
                    console.warn(chalk.red('[ MUSTIKAPAY WEBHOOK ] Signature tidak valid!'));
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ status: 'error', message: 'Invalid signature' }));
                }
            }

            const refNo = parsed.ref_no || parsed.reference || parsed.order_id || parsed.id;
            const status = (parsed.status || '').toLowerCase();

            if (!refNo) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ status: 'error', message: 'Missing ref_no' }));
            }

            // 1. Cek apakah ini transaksi pembelian produk langsung (qris_orders)
            const qrisOrder = db.getQrisOrder(refNo);
            if (qrisOrder) {
                if (status === 'success' || status === 'paid' || status === 'settlement') {
                    await processPaidQrisOrder(qrisOrder, parsed, 'webhook');
                } else if (status === 'expired' || status === 'failed') {
                    db.updateQrisOrder(refNo, { status });
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ status: 'ok', type: 'qris_order' }));
            }

            // 2. Cek apakah ini transaksi deposit saldo biasa (deposits)
            const deposit = db.getDeposit(refNo);
            if (deposit) {
                if (status === 'success' || status === 'paid' || status === 'settlement') {
                    await processPaidDeposit(deposit, parsed, 'webhook');
                } else if (status === 'expired' || status === 'failed') {
                    db.updateDeposit(refNo, { status });
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ status: 'ok', type: 'deposit' }));
            }

            console.warn(chalk.yellow(`[ MUSTIKAPAY WEBHOOK ] Ref tidak ditemukan: ${refNo}`));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ status: 'ok', message: 'Not found locally' }));
        });
        return;
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

    globalSock = sock;

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

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            currentQrString = qr;
            console.log(chalk.blue("[ INFO ] Scan QR Code di bawah atau login via FENBOT Cloud:"));
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
            currentQrString = null;
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

        if (envPhone) {
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
        } else {
            console.log(chalk.blue("\n[ INFO ] Menunggu otentikasi WhatsApp via FENBOT Cloud (QR Code / Pairing Code)..."));
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
            if (chatUpdate.type !== 'notify' || !Array.isArray(chatUpdate.messages)) return;

            for (const mek of chatUpdate.messages) {
                if (!mek.message) continue;

                const msgTime = typeof mek.messageTimestamp === 'object'
                    ? (mek.messageTimestamp.low || Number(mek.messageTimestamp))
                    : Number(mek.messageTimestamp);

                // Toleransi 10 detik agar pesan saat bot baru terhubung tidak terbuang
                if (msgTime && msgTime < (startTime - 10)) continue;

                const messageId = mek.key.id;
                if (messageCache.has(messageId)) continue;
                messageCache.add(messageId);

                if (messageCache.size > 100) {
                    const firstItem = messageCache.values().next().value;
                    messageCache.delete(firstItem);
                }

                lidHelper.extractFromMessage(sock, mek);
                try {
                    await sock.readMessages([mek.key]);
                } catch {}

                try {
                    const m = serialize(sock, mek);
                    await require("./message")(sock, m);
                } catch (msgErr) {
                    console.error(chalk.red("[ MSG PROCESS ERROR ] " + msgErr.message));
                }
            }
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

    // Background Worker: Polling status deposit MustikaPay (QRIS Otomatis) setiap 15 detik
    setInterval(async () => {
        const mustikapay = require('./lib/mustikapay');
        if (!mustikapay.apiKey) return;

        // A. Pengecekan deposit saldo biasa
        const pendingDeposits = db.getPendingDeposits();
        for (const dep of pendingDeposits) {
            const refNo = dep.ref_no || dep.id;

            // 1. Cek batas kadaluarsa tagihan (15 menit)
            if (dep.expiresAt && Date.now() > new Date(dep.expiresAt).getTime()) {
                db.updateDeposit(refNo, { status: 'expired' });
                try {
                    const notifyJid = lidHelper.toJid(dep.chat || dep.user);
                    let expMsg = `⏰ *TAGIHAN QRIS KADALUARSA (EXPIRED)* ⏰\n\n`;
                    expMsg += `▸ *Ref ID :* ${refNo}\n`;
                    expMsg += `▸ *Nominal:* Rp${Number(dep.amount).toLocaleString()}\n`;
                    expMsg += `▸ *Status :* ❌ KADALUARSA\n\n`;
                    expMsg += `_Batas waktu pembayaran 15 menit telah habis. Jika Anda masih ingin menambah saldo, silakan buat tagihan baru via *.deposit [nominal]*._`;
                    if (sock) await sock.sendMessage(notifyJid, { text: expMsg });
                } catch {}
                continue;
            }

            // 2. Proteksi konkurensi: lewati jika sedang diproses oleh webhook atau worker lain
            if (dep.isProcessing || dep.status !== 'pending') continue;

            // 3. Cek status ke API MustikaPay
            try {
                const statusRes = await mustikapay.checkQrisStatus(refNo);
                const s = (statusRes.status || '').toLowerCase();

                if (s === 'success' || s === 'paid' || s === 'settlement') {
                    await processPaidDeposit(dep, statusRes, 'polling');
                } else if (s === 'expired' || s === 'failed') {
                    db.updateDeposit(refNo, { status: s });
                }
            } catch (pollErr) {
                // Abaikan error sementara koneksi
            }
        }

        // B. Pengecekan pembelian produk Digiflazz langsung bayar via QRIS
        const pendingQrisOrders = db.getPendingQrisOrders();
        for (const ord of pendingQrisOrders) {
            const refNo = ord.ref_no || ord.id;

            // 1. Cek batas kadaluarsa tagihan (15 menit)
            if (ord.expiresAt && Date.now() > new Date(ord.expiresAt).getTime()) {
                db.updateQrisOrder(refNo, { status: 'expired' });
                try {
                    const notifyJid = lidHelper.toJid(ord.chat || ord.user);
                    let expMsg = `⏰ *TAGIHAN QRIS PEMBELIAN KADALUARSA (EXPIRED)* ⏰\n\n`;
                    expMsg += `▸ *Order ID :* ${ord.id}\n`;
                    expMsg += `▸ *Produk   :* ${ord.product_name}\n`;
                    expMsg += `▸ *Tujuan   :* ${ord.target}\n`;
                    expMsg += `▸ *Status   :* ❌ KADALUARSA\n\n`;
                    expMsg += `_Batas waktu pembayaran 15 menit telah habis. Silakan buat pesanan baru via *.buyqris*._`;
                    if (sock) await sock.sendMessage(notifyJid, { text: expMsg });
                } catch {}
                continue;
            }

            // 2. Proteksi konkurensi: lewati jika sedang diproses
            if (ord.isProcessing || ord.status !== 'pending') continue;

            // 3. Cek status ke API MustikaPay
            try {
                const statusRes = await mustikapay.checkQrisStatus(refNo);
                const s = (statusRes.status || '').toLowerCase();

                if (s === 'success' || s === 'paid' || s === 'settlement') {
                    await processPaidQrisOrder(ord, statusRes, 'polling');
                } else if (s === 'expired' || s === 'failed') {
                    db.updateQrisOrder(refNo, { status: s });
                }
            } catch (pollErr) {
                // Abaikan error sementara koneksi
            }
        }
    }, 15000);

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
