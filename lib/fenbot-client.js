/**
 * FENBOT CLOUD Internal API Client (CommonJS)
 * Menghubungkan script bot WhatsApp ke control plane FENBOT CLOUD.
 * Menggantikan ketergantungan Firebase untuk isolasi multi-tenant penuh.
 */

class FenbotClient {
    constructor(apiUrl, authToken) {
        this.apiUrl = (apiUrl || process.env.FENBOT_API_URL || '').replace(/\/+$/, '');
        this.authToken = authToken || process.env.INSTANCE_AUTH_TOKEN || '';
        this.isConfigured = Boolean(this.apiUrl && this.authToken);
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
     * Mengambil pengaturan dinamis bot dari FENBOT CLOUD (nama toko, profit markup, owner WA, dsb)
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
     * Melakukan reservasi saldo pelanggan secara ACID (Row Lock) sebelum menembak Digiflazz
     */
    async reserveBalance(phone, amount) {
        if (!this.isConfigured) return { success: true, bypassed: true };
        const cleanPhone = String(phone).replace(/\D/g, '');
        const res = await fetch(`${this.apiUrl}/internal/v1/wallets/${encodeURIComponent(cleanPhone)}/reserve`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify({ amount: Number(amount) })
        });
        const json = await res.json();
        if (!res.ok) {
            const err = new Error(json.error?.message || json.message || 'Gagal mereservasi saldo');
            err.code = json.error?.code || 'RESERVE_FAILED';
            throw err;
        }
        return json.data || json;
    }

    /**
     * Menuntaskan pemotongan saldo (Commit Debit) setelah Digiflazz mengonfirmasi transaksi sukses
     */
    async commitDebit(phone, amount) {
        if (!this.isConfigured) return { success: true, bypassed: true };
        const cleanPhone = String(phone).replace(/\D/g, '');
        const res = await fetch(`${this.apiUrl}/internal/v1/wallets/${encodeURIComponent(cleanPhone)}/commit`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify({ amount: Number(amount) })
        });
        const json = await res.json();
        if (!res.ok) {
            const err = new Error(json.error?.message || json.message || 'Gagal memotong saldo');
            err.code = json.error?.code || 'COMMIT_FAILED';
            throw err;
        }
        return json.data || json;
    }

    /**
     * Mengembalikan dana reservasi (Release) secara instan jika Digiflazz gagal/timeout
     */
    async releaseReservation(phone, amount) {
        if (!this.isConfigured) return { success: true, bypassed: true };
        const cleanPhone = String(phone).replace(/\D/g, '');
        const res = await fetch(`${this.apiUrl}/internal/v1/wallets/${encodeURIComponent(cleanPhone)}/release`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify({ amount: Number(amount) })
        });
        const json = await res.json();
        if (!res.ok) {
            console.warn('[FENBOT CLIENT] Gagal melepaskan reservasi:', json);
        }
        return json.data || json;
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
        if (!this.isConfigured) return null;
        try {
            const res = await fetch(`${this.apiUrl}/internal/v1/heartbeat`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({
                    memoryUsageMb: metrics?.memoryUsageMb || Math.round(process.memoryUsage().rss / 1024 / 1024),
                    cpuPercent: metrics?.cpuPercent || 0,
                    uptimeSeconds: metrics?.uptimeSeconds || Math.round(process.uptime()),
                    whatsAppStatus: metrics?.whatsAppStatus || 'CONNECTED'
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
