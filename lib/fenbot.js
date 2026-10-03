/**
 * FENBOT CLOUD Control Plane Bridge
 * Memungkinkan script bot WhatsApp berjalan sebagai Template Bot di platform FENBOT Cloud
 * dengan auto-sync pengaturan (Digiflazz, Profit, Toko), Heartbeat Liveness,
 * dan Zero Re-scan Session Sync.
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

class FenbotBridge {
    constructor() {
        this.apiUrl = process.env.FENBOT_API_URL || process.env.NEXT_PUBLIC_APP_URL || '';
        this.token = process.env.INSTANCE_AUTH_TOKEN || process.env.FENBOT_INSTANCE_TOKEN || '';
        this.instanceId = process.env.INSTANCE_ID || '';
        this.isEnabled = Boolean(this.apiUrl && this.token);
        this.heartbeatTimer = null;
        this.sessionTimer = null;
        this.configRef = null;
    }

    getHeaders() {
        return {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
    }

    /**
     * Menerapkan pembaruan pengaturan secara langsung ke konfigurasi runtime
     */
    applySettings(settings) {
        if (!settings || !this.configRef) return;
        const configRef = this.configRef;

        let changed = false;

        if (settings.store_name && configRef.storeName !== settings.store_name) {
            configRef.storeName = settings.store_name;
            changed = true;
        }
        if (settings.bot_name && configRef.botName !== settings.bot_name) {
            configRef.botName = settings.bot_name;
            changed = true;
        }
        if (settings.owner_name && configRef.ownerName !== settings.owner_name) {
            configRef.ownerName = settings.owner_name;
            changed = true;
        }
        if (settings.prefix) {
            const nextPrefix = Array.isArray(settings.prefix)
                ? settings.prefix
                : [settings.prefix.toString().trim() || '.'];
            if (JSON.stringify(configRef.prefix) !== JSON.stringify(nextPrefix)) {
                configRef.prefix = nextPrefix;
                changed = true;
            }
        }
        if (settings.digiflazz_username && configRef.digiflazz?.username !== settings.digiflazz_username) {
            if (!configRef.digiflazz) configRef.digiflazz = {};
            configRef.digiflazz.username = settings.digiflazz_username;
            changed = true;
        }
        if (settings.digiflazz_api_key && configRef.digiflazz?.apiKey !== settings.digiflazz_api_key) {
            if (!configRef.digiflazz) configRef.digiflazz = {};
            configRef.digiflazz.apiKey = settings.digiflazz_api_key;
            changed = true;
        }
        if (settings.arbakti_api_key && configRef.arbakti?.apiKey !== settings.arbakti_api_key) {
            if (!configRef.arbakti) configRef.arbakti = {};
            configRef.arbakti.apiKey = settings.arbakti_api_key;
            changed = true;
        }
        const newAppId = settings.arbakti_app_id || settings.arbakti_method || '';
        if (newAppId && (configRef.arbakti?.appId !== newAppId || configRef.arbakti?.method !== newAppId)) {
            if (!configRef.arbakti) configRef.arbakti = {};
            configRef.arbakti.appId = newAppId;
            configRef.arbakti.method = newAppId;
            changed = true;
        }
        if (settings.profit_markup !== undefined) {
            const pct = Number(settings.profit_markup) || 0;
            if (configRef.profitPercent !== pct) {
                configRef.profitPercent = pct;
                const marginRatio = pct / 100;
                try {
                    const db = require('./db');
                    const curSettings = db.getSettings();
                    if (!curSettings.margins) curSettings.margins = {};
                    curSettings.margins.BRONZE = marginRatio;
                    curSettings.margins.SILVER = Math.max(0, +(marginRatio * 0.7).toFixed(4));
                    curSettings.margins.GOLD = Math.max(0, +(marginRatio * 0.5).toFixed(4));
                    curSettings.margins.PLATINUM = Math.max(0, +(marginRatio * 0.3).toFixed(4));
                    curSettings.margins.OWNER = 0;
                    db.updateSettings({ margins: curSettings.margins, profit_percent: pct });
                    changed = true;
                } catch (dbErr) {
                    console.error('[ FENBOT CLOUD ] Gagal update margin:', dbErr.message);
                }
            }
        }
        if (settings.admin_phone) {
            const cleanPhone = settings.admin_phone.replace(/[^0-9]/g, '');
            if (cleanPhone && !configRef.owner.includes(cleanPhone)) {
                configRef.owner.unshift(cleanPhone);
                changed = true;
            }
        }

        // Update rekening pembayaran jika diatur
        if (settings.payment_bank && settings.payment_number) {
            try {
                const paymentPath = path.join(__dirname, '..', 'config', 'payment.json');
                const curPayment = fs.existsSync(paymentPath) ? JSON.parse(fs.readFileSync(paymentPath, 'utf8')) : { rekening: [] };
                const currentRek = curPayment.rekening && curPayment.rekening[0];
                if (!currentRek || currentRek.bank !== settings.payment_bank || currentRek.nomor !== settings.payment_number) {
                    curPayment.rekening = [
                        {
                            bank: settings.payment_bank,
                            nomor: settings.payment_number,
                            nama: settings.payment_name || configRef.ownerName || 'Admin'
                        }
                    ];
                    fs.writeFileSync(paymentPath, JSON.stringify(curPayment, null, 2));
                    changed = true;
                }
            } catch (pErr) {
                console.error('[ FENBOT CLOUD ] Gagal menyimpan payment config:', pErr.message);
            }
        }

        if (changed) {
            console.log('\x1b[32m%s\x1b[0m', `[ FENBOT CLOUD ] Pengaturan bot diperbarui otomatis dari Cloud Panel.`);
        }
    }

    /**
     * Memuat konfigurasi dinamis dari FENBOT Cloud Control Plane
     */
    async syncSettings(configRef) {
        this.configRef = configRef;
        if (!this.isEnabled) return null;

        try {
            const res = await axios.get(`${this.apiUrl}/internal/v1/instances/me`, {
                headers: this.getHeaders(),
                timeout: 10000
            });

            if (res.data && res.data.data) {
                const inst = res.data.data;
                const settings = inst.settings || {};
                this.applySettings(settings);
                console.log('\x1b[32m%s\x1b[0m', `[ FENBOT CLOUD ] Pengaturan bot berhasil disinkronkan untuk instance: ${inst.id || this.instanceId}`);
                return settings;
            }
        } catch (err) {
            console.log('\x1b[33m%s\x1b[0m', `[ FENBOT CLOUD ] Sinkronisasi pengaturan cloud dilewati (${err.message}). Menggunakan config lokal.`);
        }
        return null;
    }

    /**
     * Mengirim Heartbeat Liveness berkala ke dashboard FENBOT Cloud
     * dan menyinkronkan pengaturan real-time jika ada pembaruan dari website
     */
    startHeartbeat(getStatusCallback) {
        if (!this.isEnabled) return;

        const send = async () => {
            try {
                const status = getStatusCallback ? getStatusCallback() : {};
                const mem = process.memoryUsage();

                const res = await axios.post(`${this.apiUrl}/internal/v1/heartbeat`, {
                    instanceId: this.instanceId,
                    status: status.connected ? 'RUNNING' : 'CONNECTING',
                    whatsAppStatus: status.connected ? 'CONNECTED' : 'DISCONNECTED',
                    phoneNumber: status.phone || null,
                    uptimeSeconds: Math.floor(process.uptime()),
                    memoryBytes: mem.rss,
                    cpuPercent: 1.5,
                    timestamp: new Date().toISOString()
                }, {
                    headers: this.getHeaders(),
                    timeout: 8000
                });

                // Terapkan pembaruan konfigurasi real-time dari respons heartbeat
                if (res.data && res.data.data && res.data.data.settings) {
                    this.applySettings(res.data.data.settings);
                }
            } catch {
                // Abaikan error jaringan sementara
            }
        };

        send();
        this.heartbeatTimer = setInterval(send, 25000);
    }

    /**
     * Backup Session WhatsApp ke Cloud Storage FENBOT (Zero Re-scan)
     */
    startSessionSync(sessionDir = 'session') {
        if (!this.isEnabled) return;

        const sync = async () => {
            try {
                if (!fs.existsSync(sessionDir)) return;
                const files = fs.readdirSync(sessionDir);
                if (files.length === 0) return;

                // Membaca file sesi penting
                const sessionFiles = {};
                for (const f of files) {
                    if (f.endsWith('.json')) {
                        const filePath = path.join(sessionDir, f);
                        const content = fs.readFileSync(filePath, 'utf8');
                        sessionFiles[f] = content;
                    }
                }

                await axios.post(`${this.apiUrl}/internal/v1/sessions/sync`, {
                    instanceId: this.instanceId,
                    files: sessionFiles,
                    timestamp: new Date().toISOString()
                }, {
                    headers: this.getHeaders(),
                    timeout: 15000
                });
                console.log('\x1b[36m%s\x1b[0m', `[ FENBOT CLOUD ] Sesi WhatsApp berhasil dicadangkan ke Cloud (${Object.keys(sessionFiles).length} berkas).`);
            } catch (err) {
                // Quiet ignore
            }
        };

        // Sinkronisasi pertama setelah bot berjalan 1 menit, lalu setiap 10 menit
        setTimeout(sync, 60000);
        this.sessionTimer = setInterval(sync, 10 * 60 * 1000);
    }

    /**
     * Pulihkan berkas sesi WhatsApp dari Cloud Storage FENBOT (Zero Re-scan)
     * Dipanggil sebelum useMultiFileAuthState dijalankan.
     */
    async restoreSession(sessionDir = 'session') {
        if (!this.isEnabled) return false;

        try {
            const res = await axios.get(`${this.apiUrl}/internal/v1/sessions/restore`, {
                headers: this.getHeaders(),
                timeout: 20000
            });

            if (res.data && res.data.data && res.data.data.files) {
                const files = res.data.data.files;
                if (!fs.existsSync(sessionDir)) {
                    fs.mkdirSync(sessionDir, { recursive: true });
                }

                let count = 0;
                for (const [fileName, content] of Object.entries(files)) {
                    const targetFile = path.join(sessionDir, fileName);
                    const fileBody = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
                    fs.writeFileSync(targetFile, fileBody, 'utf8');
                    count++;
                }

                console.log('\x1b[32m%s\x1b[0m', `[ FENBOT CLOUD ] Berhasil memulihkan ${count} berkas sesi dari Cloud. Re-scan QR tidak diperlukan.`);
                return true;
            }
        } catch (err) {
            if (err.response && err.response.status === 404) {
                console.log('\x1b[33m%s\x1b[0m', `[ FENBOT CLOUD ] Belum ada cadangan sesi cloud. Memulai sesi baru via QR/Pairing.`);
            } else {
                console.log('\x1b[33m%s\x1b[0m', `[ FENBOT CLOUD ] Catatan pemulihan sesi: ${err.message}. Melanjutkan inisialisasi lokal.`);
            }
        }
        return false;
    }

    /**
     * Mengirim event status WhatsApp asli dari Baileys ke FENBOT Cloud Control Plane
     */
    async sendWhatsAppStatus(status, details = {}) {
        if (!this.isEnabled) return;

        try {
            await axios.post(`${this.apiUrl}/internal/v1/whatsapp/status`, {
                instanceId: this.instanceId,
                status,
                phoneNumber: details.phoneNumber || null,
                qrString: details.qrString || null,
                pairingCode: details.pairingCode || null,
                timestamp: new Date().toISOString()
            }, {
                headers: this.getHeaders(),
                timeout: 8000
            });
        } catch {
            // Quiet fail
        }
    }
}

module.exports = new FenbotBridge();
