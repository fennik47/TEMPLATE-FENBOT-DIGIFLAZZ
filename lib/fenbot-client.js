/**
 * FENBOT CLOUD Internal API Client (CommonJS)
 * Menghubungkan script bot WhatsApp ke control plane FENBOT CLOUD.
 * Mengelola otentikasi bot bearer, mutasi saldo ACID, sinkronisasi order,
 * telemetri heartbeat, dan pemulihan sesi WhatsApp lintas node.
 */

const fs = require('fs');
const path = require('path');

class FenbotClient {
    constructor(apiUrl, authToken, instanceId) {
        this.apiUrl = (apiUrl || process.env.FENBOT_API_URL || process.env.CONTROL_PLANE_URL || '').replace(/\/+$/, '');
        this.authToken = authToken || process.env.INSTANCE_AUTH_TOKEN || '';
        this.instanceId = instanceId || process.env.INSTANCE_ID || '';
        this.isConfigured = Boolean(this.apiUrl && this.authToken);
    }

    assertConfigured() {
        if (!this.apiUrl) {
            throw new Error('FENBOT_API_URL atau CONTROL_PLANE_URL wajib dikonfigurasi.');
        }
        if (!this.authToken) {
            throw new Error('INSTANCE_AUTH_TOKEN wajib dikonfigurasi.');
        }
    }

    getHeaders() {
        return {
            'Authorization': `Bearer ${this.authToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
    }

    /**
     * Mengambil metadata instance bot dari FENBOT CLOUD
     */
    async getInstanceMetadata() {
        if (!this.isConfigured) return null;
        try {
            const res = await fetch(`${this.apiUrl}/internal/v1/instances/me`, {
                headers: this.getHeaders()
            });
            if (!res.ok) return null;
            const json = await res.json();
            return json.data || null;
        } catch (err) {
            console.warn('[FENBOT CLIENT] Gagal mengambil metadata instance:', err.message);
            return null;
        }
    }

    /**
     * Mengambil pengaturan dinamis bot dari FENBOT CLOUD
     */
    async fetchSettings() {
        if (!this.isConfigured) return null;
        try {
            const res = await fetch(`${this.apiUrl}/internal/v1/settings`, {
                headers: this.getHeaders()
            });
            if (!res.ok) return null;
            const json = await res.json();
            return json.data?.settings || json.data || {};
        } catch (err) {
            console.warn('[FENBOT CLIENT] Gagal mengambil pengaturan FENBOT CLOUD:', err.message);
            return null;
        }
    }

    /**
     * Mengambil data profil pelanggan yang terisolasi khusus untuk bot instance ini
     */
    async getCustomer(phone) {
        if (!this.isConfigured) return null;
        try {
            const cleanPhone = String(phone).replace(/\D/g, '');
            const res = await fetch(`${this.apiUrl}/internal/v1/customers/${encodeURIComponent(cleanPhone)}`, {
                headers: this.getHeaders()
            });
            if (!res.ok) return null;
            const json = await res.json();
            return json.data || null;
        } catch (err) {
            console.warn('[FENBOT CLIENT] Gagal mengambil data pelanggan:', err.message);
            return null;
        }
    }

    /**
     * Mengambil saldo wallet pelanggan yang terikat ke bot instance ini
     */
    async getWallet(phone) {
        if (!this.isConfigured) return null;
        try {
            const cleanPhone = String(phone).replace(/\D/g, '');
            const res = await fetch(`${this.apiUrl}/internal/v1/wallets/${encodeURIComponent(cleanPhone)}`, {
                headers: this.getHeaders()
            });
            if (!res.ok) return null;
            const json = await res.json();
            return json.data || null;
        } catch (err) {
            console.warn('[FENBOT CLIENT] Gagal mengambil wallet pelanggan:', err.message);
            return null;
        }
    }

    /**
     * Helper untuk mendapatkan variasi nomor HP (628xxx dan 08xxx)
     */
    getPhoneVariants(phone) {
        const clean = String(phone || '').replace(/\D/g, '');
        if (!clean) return [];
        const variants = [clean];
        if (clean.startsWith('628')) {
            variants.push('0' + clean.slice(2));
        } else if (clean.startsWith('08')) {
            variants.push('62' + clean.slice(1));
        } else if (clean.startsWith('8')) {
            variants.push('62' + clean);
            variants.push('0' + clean);
        }
        return [...new Set(variants)];
    }

    /**
     * Melakukan reservasi saldo pelanggan secara ACID (Row Lock) sebelum menembak provider
     */
    async reserveBalance(phone, amount) {
        if (!this.isConfigured) {
            const err = new Error('FENBOT Cloud belum terkonfigurasi. Tidak dapat mereservasi saldo.');
            err.code = 'UNCONFIGURED';
            throw err;
        }
        const variants = this.getPhoneVariants(phone);
        const cleanPhone = variants[0] || String(phone).replace(/\D/g, '');

        // Auto-provisioning jika user belum pernah di-query
        await this.getWallet(cleanPhone).catch(() => {});

        let lastError = null;
        for (const targetPhone of variants) {
            try {
                const res = await fetch(`${this.apiUrl}/internal/v1/wallets/${encodeURIComponent(targetPhone)}/reserve`, {
                    method: 'POST',
                    headers: this.getHeaders(),
                    body: JSON.stringify({ amount: Number(amount) })
                });
                const json = await res.json().catch(() => ({}));
                if (res.ok) {
                    return json.data || json;
                }
                lastError = new Error(json.error?.message || json.message || 'Gagal mereservasi saldo');
                lastError.code = json.error?.code || 'RESERVE_FAILED';

                if (lastError.code === 'CUSTOMER_NOT_FOUND' || lastError.message?.toLowerCase().includes('tidak ditemukan')) {
                    await this.getWallet(targetPhone).catch(() => {});
                    continue;
                }
                throw lastError;
            } catch (err) {
                if (err.code !== 'CUSTOMER_NOT_FOUND' && !err.message?.toLowerCase().includes('tidak ditemukan')) {
                    throw err;
                }
                lastError = err;
            }
        }
        throw lastError || new Error('Gagal mereservasi saldo');
    }

    /**
     * Menuntaskan pemotongan saldo (Commit Debit) setelah provider mengonfirmasi sukses
     */
    async commitDebit(phone, amount) {
        if (!this.isConfigured) {
            const err = new Error('FENBOT Cloud belum terkonfigurasi. Tidak dapat memotong saldo.');
            err.code = 'UNCONFIGURED';
            throw err;
        }
        const variants = this.getPhoneVariants(phone);
        let lastError = null;

        for (const targetPhone of variants) {
            try {
                const res = await fetch(`${this.apiUrl}/internal/v1/wallets/${encodeURIComponent(targetPhone)}/commit`, {
                    method: 'POST',
                    headers: this.getHeaders(),
                    body: JSON.stringify({ amount: Number(amount) })
                });
                const json = await res.json().catch(() => ({}));
                if (res.ok) {
                    return json.data || json;
                }
                lastError = new Error(json.error?.message || json.message || 'Gagal memotong saldo');
                lastError.code = json.error?.code || 'COMMIT_FAILED';

                if (lastError.code === 'CUSTOMER_NOT_FOUND' || lastError.message?.toLowerCase().includes('tidak ditemukan')) {
                    continue;
                }
                throw lastError;
            } catch (err) {
                if (err.code !== 'CUSTOMER_NOT_FOUND' && !err.message?.toLowerCase().includes('tidak ditemukan')) {
                    throw err;
                }
                lastError = err;
            }
        }
        throw lastError || new Error('Gagal memotong saldo');
    }

    /**
     * Mengembalikan dana reservasi (Release) secara instan jika provider gagal
     */
    async releaseReservation(phone, amount) {
        if (!this.isConfigured) return { success: true, bypassed: true };
        const variants = this.getPhoneVariants(phone);
        for (const targetPhone of variants) {
            try {
                const res = await fetch(`${this.apiUrl}/internal/v1/wallets/${encodeURIComponent(targetPhone)}/release`, {
                    method: 'POST',
                    headers: this.getHeaders(),
                    body: JSON.stringify({ amount: Number(amount) })
                });
                const json = await res.json().catch(() => ({}));
                if (res.ok) {
                    return json.data || json;
                }
            } catch (err) {
                // Ignore transient release errors
            }
        }
        return { success: true };
    }

    /**
     * Menambahkan saldo pelanggan (Top Up / Credit) dengan transaksi ACID
     */
    async creditBalance(phone, amount, idempotencyKey) {
        if (!this.isConfigured) {
            const err = new Error('FENBOT Cloud belum terkonfigurasi.');
            err.code = 'UNCONFIGURED';
            throw err;
        }
        const variants = this.getPhoneVariants(phone);
        const cleanPhone = variants[0] || String(phone).replace(/\D/g, '');
        if (!cleanPhone) {
            throw new Error('Nomor HP pelanggan tidak valid.');
        }

        // 1. Auto-provisioning: Panggil getWallet agar customer & wallet dibuat di PostgreSQL jika belum ada
        await this.getWallet(cleanPhone).catch(() => {});

        // 2. Eksekusi kredit ke FENBOT Cloud
        let lastError = null;
        for (const targetPhone of variants) {
            try {
                const res = await fetch(`${this.apiUrl}/internal/v1/wallets/${encodeURIComponent(targetPhone)}/credit`, {
                    method: 'POST',
                    headers: this.getHeaders(),
                    body: JSON.stringify({ amount: Number(amount), idempotencyKey })
                });
                const json = await res.json().catch(() => ({}));
                if (res.ok) {
                    return json.data || json;
                }

                lastError = new Error(json.error?.message || json.message || 'Gagal menambah saldo');
                lastError.code = json.error?.code || 'CREDIT_FAILED';

                // Jika customer belum ditemukan, inisialisasi wallet targetPhone lalu coba varian berikutnya
                if (lastError.code === 'CUSTOMER_NOT_FOUND' || lastError.message?.toLowerCase().includes('tidak ditemukan')) {
                    await this.getWallet(targetPhone).catch(() => {});
                    continue;
                }
                throw lastError;
            } catch (err) {
                if (err.code !== 'CUSTOMER_NOT_FOUND' && !err.message?.toLowerCase().includes('tidak ditemukan')) {
                    throw err;
                }
                lastError = err;
            }
        }

        throw lastError || new Error('Gagal menambah saldo');
    }

    /**
     * Mengurangi saldo pelanggan secara langsung (Admin Debit) dengan transaksi ACID
     */
    async debitBalance(phone, amount, idempotencyKey) {
        if (!this.isConfigured) {
            const err = new Error('FENBOT Cloud belum terkonfigurasi.');
            err.code = 'UNCONFIGURED';
            throw err;
        }
        const variants = this.getPhoneVariants(phone);
        const cleanPhone = variants[0] || String(phone).replace(/\D/g, '');
        if (!cleanPhone) {
            throw new Error('Nomor HP pelanggan tidak valid.');
        }

        // 1. Auto-provisioning: Panggil getWallet agar customer & wallet terdaftar di PostgreSQL
        await this.getWallet(cleanPhone).catch(() => {});

        let lastError = null;
        for (const targetPhone of variants) {
            try {
                const res = await fetch(`${this.apiUrl}/internal/v1/wallets/${encodeURIComponent(targetPhone)}/debit`, {
                    method: 'POST',
                    headers: this.getHeaders(),
                    body: JSON.stringify({ amount: Number(amount), idempotencyKey })
                });
                const json = await res.json().catch(() => ({}));
                if (res.ok) {
                    return json.data || json;
                }

                lastError = new Error(json.error?.message || json.message || 'Gagal mengurangi saldo');
                lastError.code = json.error?.code || 'DEBIT_FAILED';

                if (lastError.code === 'CUSTOMER_NOT_FOUND' || lastError.message?.toLowerCase().includes('tidak ditemukan')) {
                    await this.getWallet(targetPhone).catch(() => {});
                    continue;
                }
                throw lastError;
            } catch (err) {
                if (err.code !== 'CUSTOMER_NOT_FOUND' && !err.message?.toLowerCase().includes('tidak ditemukan')) {
                    throw err;
                }
                lastError = err;
            }
        }

        throw lastError || new Error('Gagal mengurangi saldo');
    }

    /**
     * Mencatat pesanan baru ke tabel orders dan ledger audit PostgreSQL
     */
    async recordOrder(orderData) {
        if (!this.isConfigured) return null;
        try {
            const res = await fetch(`${this.apiUrl}/internal/v1/orders`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify(orderData)
            });
            const json = await res.json();
            return json.data || null;
        } catch (err) {
            console.warn('[FENBOT CLIENT] Gagal mencatat order ke FENBOT CLOUD:', err.message);
            return null;
        }
    }

    /**
     * Mengirim heartbeat telemetri kesehatan bot (RAM, CPU, Uptime, Status WhatsApp)
     */
    async sendHeartbeat(metrics) {
        if (!this.isConfigured) return false;
        try {
            const res = await fetch(`${this.apiUrl}/internal/v1/heartbeat`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({
                    instanceId: this.instanceId,
                    status: metrics?.status || 'RUNNING',
                    whatsAppStatus: metrics?.whatsAppStatus || 'CONNECTED',
                    phoneNumber: metrics?.phoneNumber || null,
                    uptimeSeconds: metrics?.uptimeSeconds || Math.floor(process.uptime()),
                    memoryBytes: metrics?.memoryBytes || process.memoryUsage().rss,
                    cpuPercent: metrics?.cpuPercent || 0,
                    timestamp: new Date().toISOString()
                })
            });
            return res.ok;
        } catch {
            return false;
        }
    }

    /**
     * Mengirim laporan status koneksi Baileys, QR string asli, atau pairing code ke Control Plane
     */
    async sendWhatsAppStatus(status, details = {}) {
        if (!this.isConfigured) return;
        try {
            await fetch(`${this.apiUrl}/internal/v1/whatsapp/status`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({
                    instanceId: this.instanceId,
                    status,
                    phoneNumber: details.phoneNumber || null,
                    qrString: details.qrString || null,
                    pairingCode: details.pairingCode || null,
                    timestamp: new Date().toISOString()
                })
            });
        } catch {
            // Quiet fail
        }
    }

    /**
     * Memulihkan sesi WhatsApp dari Cloud Storage FENBOT (R2/S3)
     */
    async restoreSession(sessionDir = 'session') {
        if (!this.isConfigured) return false;
        try {
            const res = await fetch(`${this.apiUrl}/internal/v1/sessions/restore`, {
                headers: this.getHeaders()
            });
            if (!res.ok) {
                if (res.status === 404) {
                    console.log('\x1b[33m%s\x1b[0m', '[ FENBOT CLOUD ] Belum ada cadangan sesi cloud. Memulai sesi baru.');
                }
                return false;
            }
            const json = await res.json();
            const files = json.data?.files;
            if (!files || Object.keys(files).length === 0) return false;

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
        } catch (err) {
            console.log('\x1b[33m%s\x1b[0m', `[ FENBOT CLOUD ] Catatan pemulihan sesi: ${err.message}.`);
            return false;
        }
    }

    /**
     * Menyinkronkan pembaruan sesi WhatsApp ke Cloud Storage FENBOT
     */
    async syncSession(sessionDir = 'session') {
        if (!this.isConfigured) return false;
        try {
            if (!fs.existsSync(sessionDir)) return false;
            const files = fs.readdirSync(sessionDir);
            if (files.length === 0) return false;

            const sessionFiles = {};
            for (const f of files) {
                if (f.endsWith('.json')) {
                    const filePath = path.join(sessionDir, f);
                    sessionFiles[f] = fs.readFileSync(filePath, 'utf8');
                }
            }

            const res = await fetch(`${this.apiUrl}/internal/v1/sessions/sync`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({
                    instanceId: this.instanceId,
                    files: sessionFiles,
                    timestamp: new Date().toISOString()
                })
            });
            return res.ok;
        } catch {
            return false;
        }
    }
}

const fenbotClient = new FenbotClient();

module.exports = {
    FenbotClient,
    fenbotClient
};
