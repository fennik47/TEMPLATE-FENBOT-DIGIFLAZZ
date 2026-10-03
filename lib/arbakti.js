const axios = require('axios');
const crypto = require('crypto');
const config = require('../config/config');

class ArbaktiPay {
    get apiKey() {
        let dbApiKey = '';
        try {
            const db = require('./db');
            const settings = db.getSettings ? db.getSettings() : {};
            dbApiKey = settings.arbakti_api_key || settings.arbaktiApiKey || settings.arbakti_key || settings.apiKey || '';
        } catch {}

        if (!dbApiKey) {
            try {
                const fs = require('fs');
                const path = require('path');
                const p = path.join(__dirname, '..', 'database', 'settings.json');
                if (fs.existsSync(p)) {
                    const s = JSON.parse(fs.readFileSync(p, 'utf8'));
                    dbApiKey = s.arbakti_api_key || s.arbaktiApiKey || s.arbakti_key || s.apiKey || '';
                }
            } catch {}
        }

        return this._apiKey || dbApiKey || config.arbakti?.apiKey || process.env.ARBAKTI_API_KEY || '';
    }

    set apiKey(val) {
        this._apiKey = val;
    }

    constructor(options = {}) {
        this._apiKey = options.apiKey || (options.config && options.config.apiKey) || null;
        this.baseUrl = (options.baseUrl || process.env.ARBAKTI_BASE_URL || 'https://payment.arbakti.monster').replace(/\/+$/, '');
    }

    /**
     * Membuat tagihan QRIS dinamis baru via Arbakti
     * @param {number|string} amount - Nominal pembayaran dasar
     * @param {object} options - Parameter tambahan (paymentMethod, callbackUrl, dll)
     */
    async createQris(amount, options = {}) {
        if (!this.apiKey) {
            throw new Error('API Key Arbakti belum dikonfigurasi.');
        }

        const cleanAmount = parseInt(String(amount).replace(/[^0-9]/g, ''));
        if (isNaN(cleanAmount) || cleanAmount <= 0) {
            throw new Error('Nominal amount tidak valid.');
        }

        const payload = {
            action: 'create',
            apikey: this.apiKey,
            amount: cleanAmount,
            paymentMethod: options.paymentMethod || 'qrisgopay'
        };

        if (options.callbackUrl) {
            payload.callbackUrl = options.callbackUrl;
        }

        try {
            const res = await axios.post(`${this.baseUrl}/payment/qris`, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Fenbot-Arbakti-Client/1.0'
                },
                timeout: 15000
            });

            const body = res.data || {};
            if (body.success && body.data) {
                const d = body.data;
                return {
                    success: true,
                    status: (d.status || 'pending').toLowerCase(),
                    transactionId: d.transactionId,
                    ref_no: d.transactionId,
                    amount: Number(d.amount) || cleanAmount,
                    paymentMethod: d.paymentMethod || payload.paymentMethod,
                    qr_base64: d.qr_base64 || '',
                    qr_url: d.qr_url || '',
                    paymentUrl: d.paymentUrl || '',
                    expiredAt: d.expiredAt || '',
                    createdAt: d.createdAt || '',
                    message: body.message || 'QRIS berhasil dibuat'
                };
            }

            return {
                status: 'error',
                message: body.message || 'Gagal membuat QRIS di Arbakti'
            };
        } catch (error) {
            // Jika metode pembayaran 'qrisgopay' ditolak, coba alternatif 'qris'
            if (error.response?.data?.message?.toLowerCase().includes('metode') && payload.paymentMethod === 'qrisgopay') {
                try {
                    payload.paymentMethod = 'qris';
                    const retryRes = await axios.post(`${this.baseUrl}/payment/qris`, payload, {
                        headers: { 'Content-Type': 'application/json' },
                        timeout: 15000
                    });
                    const rBody = retryRes.data || {};
                    if (rBody.success && rBody.data) {
                        const d = rBody.data;
                        return {
                            success: true,
                            status: (d.status || 'pending').toLowerCase(),
                            transactionId: d.transactionId,
                            ref_no: d.transactionId,
                            amount: Number(d.amount) || cleanAmount,
                            paymentMethod: d.paymentMethod || payload.paymentMethod,
                            qr_base64: d.qr_base64 || '',
                            qr_url: d.qr_url || '',
                            paymentUrl: d.paymentUrl || '',
                            expiredAt: d.expiredAt || '',
                            createdAt: d.createdAt || '',
                            message: rBody.message || 'QRIS berhasil dibuat'
                        };
                    }
                } catch (retryErr) {
                    return this._handleError(retryErr);
                }
            }
            return this._handleError(error);
        }
    }

    /**
     * Mengecek status transaksi menggunakan ID Transaksi
     * Endpoint ini tidak memerlukan otentikasi API Key sesuai dokumentasi Arbakti
     * @param {string} type - Jenis transaksi ('qris', 'ewallet', 'bank')
     * @param {string} transactionId - ID transaksi Arbakti (contoh: TRX-1753790123456)
     */
    async checkStatus(type = 'qris', transactionId) {
        const cleanType = (type || 'qris').toLowerCase();
        const cleanId = (transactionId || '').trim();

        if (!cleanId) {
            throw new Error('transactionId wajib disertakan.');
        }

        try {
            const res = await axios.get(`${this.baseUrl}/payment/${cleanType}/status/${encodeURIComponent(cleanId)}`, {
                timeout: 15000
            });

            const body = res.data || {};
            if (body.success && body.data) {
                const d = body.data;
                const status = (d.status || '').toLowerCase();
                return {
                    success: true,
                    status: status === 'paid' ? 'success' : status,
                    transactionId: d.transactionId,
                    ref_no: d.transactionId,
                    amount: d.amount,
                    method: d.method,
                    expiredAt: d.expiredAt,
                    createdAt: d.createdAt,
                    data: d
                };
            }

            return {
                status: 'unknown',
                message: body.message || 'Detail transaksi tidak ditemukan'
            };
        } catch (error) {
            return this._handleError(error);
        }
    }

    /**
     * Alias pengecekan status khusus transaksi QRIS
     */
    async checkQrisStatus(transactionId) {
        return this.checkStatus('qris', transactionId);
    }

    /**
     * Mengambil daftar metode pembayaran yang aktif di akun Arbakti
     */
    async getPaymentList() {
        if (!this.apiKey) {
            throw new Error('API Key Arbakti belum dikonfigurasi.');
        }

        try {
            const res = await axios.post(`${this.baseUrl}/payment/list`, {
                apikey: this.apiKey
            }, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 15000
            });
            return res.data || {};
        } catch (error) {
            return this._handleError(error);
        }
    }

    /**
     * Memverifikasi signature callback webhook dari Arbakti
     * Menggunakan HMAC SHA-256 dengan API Key sebagai secret
     * Signature format: sha256=abcdef...
     */
    verifyCallback(body, signature) {
        if (!signature || !this.apiKey) return false;
        try {
            const payload = typeof body === 'string' ? body : JSON.stringify(body);
            const expected = 'sha256=' + crypto
                .createHmac('sha256', this.apiKey)
                .update(payload)
                .digest('hex');
            return signature === expected;
        } catch {
            return false;
        }
    }

    _handleError(error) {
        if (error.response) {
            const status = error.response.status;
            const resData = error.response.data || {};
            const detailMsg = resData.message || resData.detail || resData.error;

            if (status === 401) {
                return {
                    status: 'error',
                    message: `API Key Arbakti tidak valid atau tidak ditemukan (Error 401). Pastikan API Key diatur dengan benar via .setarbakti [apikey].`,
                    raw: resData
                };
            }

            if (status === 404) {
                return {
                    status: 'not_found',
                    message: detailMsg || 'Transaksi atau metode pembayaran tidak ditemukan (Error 404)',
                    raw: resData
                };
            }

            return {
                status: 'error',
                message: detailMsg || `Error HTTP ${status}`,
                raw: resData
            };
        } else if (error.request) {
            return {
                status: 'error',
                message: 'Gagal terhubung ke server Arbakti (Timeout/Network Error)'
            };
        } else {
            return {
                status: 'error',
                message: error.message || 'Terjadi kesalahan sistem'
            };
        }
    }
}

module.exports = new ArbaktiPay();
