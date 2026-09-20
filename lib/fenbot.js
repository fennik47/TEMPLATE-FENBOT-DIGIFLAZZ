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
    }

    getHeaders() {
        return {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
    }

    /**
     * Memuat konfigurasi dinamis dari FENBOT Cloud Control Plane
     */
    async syncSettings(configRef) {
        if (!this.isEnabled) return null;

        try {
            const res = await axios.get(`${this.apiUrl}/internal/v1/instances/me`, {
                headers: this.getHeaders(),
                timeout: 10000
            });

            if (res.data && res.data.data) {
                const inst = res.data.data;
                const settings = inst.settings || {};

                // Update referensi config runtime
                if (settings.digiflazz_username) configRef.digiflazz.username = settings.digiflazz_username;
                if (settings.digiflazz_api_key) configRef.digiflazz.apiKey = settings.digiflazz_api_key;
                if (settings.profit_markup !== undefined) configRef.profit = Number(settings.profit_markup);
                if (settings.store_name) configRef.storeName = settings.store_name;
                if (settings.admin_phone) {
                    const cleanPhone = settings.admin_phone.replace(/[^0-9]/g, '');
                    if (!configRef.owner.includes(cleanPhone)) {
                        configRef.owner.unshift(cleanPhone);
                    }
                }

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
     */
    startHeartbeat(getStatusCallback) {
        if (!this.isEnabled) return;

        const send = async () => {
            try {
                const status = getStatusCallback ? getStatusCallback() : {};
                const mem = process.memoryUsage();

                await axios.post(`${this.apiUrl}/internal/v1/heartbeat`, {
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
}

module.exports = new FenbotBridge();
