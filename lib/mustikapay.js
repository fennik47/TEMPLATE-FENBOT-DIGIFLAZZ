const axios = require('axios');
const crypto = require('crypto');
const config = require('../config/config');

class MustikaPay {
    get username() {
        let dbUsername = '';
        try {
            const db = require('./db');
            const settings = db.getSettings ? db.getSettings() : {};
            dbUsername = settings.mustikapay_username || '';
        } catch {}
        return this._username || dbUsername || config.mustikapay?.username || process.env.MUSTIKAPAY_USERNAME || '';
    }

    set username(val) {
        this._username = val;
    }

    get apiKey() {
        let dbApiKey = '';
        try {
            const db = require('./db');
            const settings = db.getSettings ? db.getSettings() : {};
            dbApiKey = settings.mustikapay_api_key || '';
        } catch {}
        return this._apiKey || dbApiKey || config.mustikapay?.apiKey || process.env.MUSTIKAPAY_API_KEY || '';
    }

    set apiKey(val) {
        this._apiKey = val;
    }

    constructor(options = {}) {
        this._username = options.username || (options.config && options.config.username) || null;
        this._apiKey = options.apiKey || (options.config && options.config.apiKey) || null;
        this.baseUrl = (options.baseUrl || process.env.MUSTIKAPAY_BASE_URL || 'https://mustikapayment.com').replace(/\/+$/, '');
    }

    getClient() {
        return axios.create({
            baseURL: this.baseUrl,
            headers: {
                'x-api-key': this.apiKey,
                'x-username': this.username,
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 15000
        });
    }

    /**
     * Membuat tagihan QRIS dinamis baru
     * @param {number|string} amount - Nominal deposit
     * @param {object} options - Parameter opsional (product_name, customer_name, expiry, redirect_url)
     */
    async createQris(amount, options = {}) {
        if (!this.username || !this.apiKey) {
            throw new Error('Username dan API Key MustikaPay belum dikonfigurasi.');
        }

        const params = new URLSearchParams();
        params.append('user', this.username);
        params.append('amount', String(amount));
        params.append('product_name', options.product_name || 'Deposit Saldo');
        params.append('customer_name', options.customer_name || 'Pelanggan');
        if (options.expiry) params.append('expiry', String(options.expiry));
        if (options.redirect_url) params.append('redirect_url', String(options.redirect_url));

        try {
            const client = this.getClient();
            const response = await client.post('/api/v1/create/qris', params.toString());
            const data = response.data || {};
            if (data.status) {
                data.status = String(data.status).toLowerCase();
            }
            return data;
        } catch (error) {
            return this._handleError(error);
        }
    }

    /**
     * Mengecek status tagihan QRIS berdasarkan ref_no
     * @param {string} refNo - Kode referensi dari MustikaPay
     */
    async checkQrisStatus(refNo) {
        if (!this.apiKey) {
            throw new Error('API Key MustikaPay belum dikonfigurasi.');
        }

        try {
            const client = this.getClient();
            const response = await client.get('/api/v1/check/qris', {
                params: {
                    ref_no: refNo,
                    user: this.username || undefined
                }
            });
            const data = response.data || {};
            if (data.status) {
                data.status = String(data.status).toLowerCase();
            }
            return data;
        } catch (error) {
            return this._handleError(error);
        }
    }

    /**
     * Memverifikasi signature callback webhook dari MustikaPay
     * Menggunakan HMAC SHA-256 dengan API Key sebagai secret
     */
    verifyCallback(body, signature) {
        if (!signature || !this.apiKey) return false;
        try {
            const payload = typeof body === 'string' ? body : JSON.stringify(body);
            const expectedSignature = crypto
                .createHmac('sha256', this.apiKey)
                .update(payload)
                .digest('hex');
            return expectedSignature === signature;
        } catch {
            return false;
        }
    }

    _handleError(error) {
        if (error.response) {
            const status = error.response.status;
            const resData = error.response.data || {};
            const detailMsg = resData.detail || resData.message;

            if (status === 401 || status === 403) {
                const reason = detailMsg ? detailMsg : `Akses Ditolak (${status})`;
                return {
                    status: 'error',
                    message: `${reason}. Pastikan Username dan API Key MustikaPay Anda valid di pengaturan.`,
                    raw: resData
                };
            }

            return {
                status: 'error',
                message: detailMsg || `Error ${status}`,
                raw: resData
            };
        } else if (error.request) {
            return {
                status: 'error',
                message: 'Gagal terhubung ke server MustikaPay (Timeout/Network Error)'
            };
        } else {
            return {
                status: 'error',
                message: error.message || 'Terjadi kesalahan sistem'
            };
        }
    }
}

module.exports = new MustikaPay();
