const axios = require('axios');
const crypto = require('crypto');
const { URLSearchParams } = require('url');
const config = require('../config/config');

class MustikaPay {
    get apiKey() {
        return this._apiKey || config.mustikapay?.apiKey || process.env.MUSTIKAPAY_API_KEY || '';
    }

    set apiKey(val) {
        this._apiKey = val;
    }

    constructor(options = {}) {
        this._apiKey = options.apiKey || (options.config && options.config.apiKey) || null;
        this.baseUrl = (options.baseUrl || process.env.MUSTIKAPAY_BASE_URL || 'https://mustikapayment.com').replace(/\/+$/, '');
    }

    getClient() {
        return axios.create({
            baseURL: this.baseUrl,
            headers: {
                'X-Api-Key': this.apiKey,
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'FENBOT-MustikaPay/1.0.0'
            },
            timeout: 15000
        });
    }

    /**
     * Membuat tagihan QRIS dinamis baru
     * @param {number|string} amount - Nominal deposit
     */
    async createQris(amount) {
        if (!this.apiKey) {
            throw new Error('API Key MustikaPay belum dikonfigurasi.');
        }

        const params = new URLSearchParams();
        params.append('amount', String(amount));

        try {
            const client = this.getClient();
            const response = await client.post('/api/v1/create/qris', params.toString());
            const data = response.data || {};
            if (data.status) {
                data.status = data.status.toLowerCase();
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
                params: { ref_no: refNo }
            });
            const data = response.data || {};
            if (data.status) {
                data.status = data.status.toLowerCase();
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
            const resData = error.response.data || {};
            return {
                status: 'error',
                message: resData.detail || resData.message || `Error ${error.response.status}`,
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
