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

    get appId() {
        let dbAppId = '';
        try {
            const db = require('./db');
            const settings = db.getSettings ? db.getSettings() : {};
            dbAppId = settings.arbakti_app_id || settings.arbaktiAppId || settings.arbakti_method || settings.arbaktiMethod || '';
        } catch {}

        if (!dbAppId) {
            try {
                const fs = require('fs');
                const path = require('path');
                const p = path.join(__dirname, '..', 'database', 'settings.json');
                if (fs.existsSync(p)) {
                    const s = JSON.parse(fs.readFileSync(p, 'utf8'));
                    dbAppId = s.arbakti_app_id || s.arbaktiAppId || s.arbakti_method || s.arbaktiMethod || '';
                }
            } catch {}
        }

        return this._appId || this._preferredMethod || dbAppId || config.arbakti?.appId || config.arbakti?.method || process.env.ARBAKTI_APP_ID || process.env.ARBAKTI_PAYMENT_METHOD || '';
    }

    set appId(val) {
        this._appId = val;
        this._preferredMethod = val;
    }

    get preferredMethod() {
        return this.appId;
    }

    set preferredMethod(val) {
        this.appId = val;
    }

    constructor(options = {}) {
        this._apiKey = options.apiKey || (options.config && options.config.apiKey) || null;
        this._appId = options.appId || options.method || (options.config && (options.config.appId || options.config.method)) || null;
        this._preferredMethod = this._appId;
        this.baseUrl = (options.baseUrl || process.env.ARBAKTI_BASE_URL || 'https://payment.arbakti.monster').replace(/\/+$/, '');
        this._cachedList = null;
        this._lastListTime = 0;
    }

    /**
     * Mengambil daftar semua metode pembayaran (QRIS, E-Wallet, Bank) yang aktif di akun Arbakti
     * Endpoint: POST /payment/list
     * @param {boolean} forceRefresh - Paksa ambil data terbaru tanpa cache
     */
    async getPaymentList(forceRefresh = false) {
        if (!this.apiKey) {
            return {
                status: 'error',
                message: 'API Key Arbakti belum dikonfigurasi.'
            };
        }

        const now = Date.now();
        if (!forceRefresh && this._cachedList && (now - this._lastListTime < 60000)) {
            return {
                success: true,
                data: this._cachedList,
                message: 'Menggunakan data metode pembayaran tersimpan'
            };
        }

        try {
            const res = await axios.post(`${this.baseUrl}/payment/list`, {
                apikey: this.apiKey
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Fenbot-Arbakti-Client/1.0'
                },
                timeout: 15000
            });

            const body = res.data || {};
            if (body.success && body.data) {
                this._cachedList = body.data;
                this._lastListTime = Date.now();
                return {
                    success: true,
                    data: body.data,
                    message: body.message || 'Berhasil menampilkan list ID Payment'
                };
            }

            return {
                status: 'error',
                message: body.message || 'Gagal mengambil daftar metode pembayaran dari Arbakti',
                raw: body
            };
        } catch (error) {
            return this._handleError(error);
        }
    }

    /**
     * Mendapatkan daftar metode QRIS yang aktif di akun Arbakti
     * @param {boolean} forceRefresh - Paksa perbarui dari server
     * @returns {Promise<Array<{id: string, name: string, minAmount: number, maxAmount: number, fee: number, feeType: string}>>}
     */
    async getActiveQrisMethods(forceRefresh = false) {
        const res = await this.getPaymentList(forceRefresh);
        if (!res.success || !res.data) return [];
        const qrisData = res.data.QRIS;
        if (!qrisData) return [];
        const list = Array.isArray(qrisData) ? qrisData : [qrisData];
        return list.filter(item => item && item.id);
    }

    /**
     * Membuat tagihan QRIS dinamis baru via Arbakti
     * Mendukung auto-detection ID metode QRIS yang aktif di akun merchant
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

        // 1. Tentukan ID Aplikasi (paymentMethod) yang digunakan bot ini
        const targetAppId = options.appId || options.paymentMethod || this.appId;

        let candidates = [];
        if (targetAppId) {
            candidates.push(targetAppId);
        } else {
            // Jika ID Aplikasi belum dikonfigurasi, cari dari daftar aplikasi aktif di akun
            try {
                const activeList = await this.getActiveQrisMethods(false);
                if (activeList.length > 0) {
                    // Cek apakah ada yang cocok dengan FENBOT atau kris
                    const match = activeList.find(item => {
                        const s = (item.id + ' ' + (item.name || '')).toLowerCase();
                        return s.includes('fenbot') || s.includes('kris');
                    });
                    if (match) {
                        candidates.push(match.id);
                    } else {
                        candidates.push(activeList[0].id);
                    }
                } else if (this._cachedList && Array.isArray(this._cachedList.QRIS) && this._cachedList.QRIS.length === 0) {
                    return {
                        status: 'error',
                        message: 'Belum ada ID Aplikasi QRIS yang aktif di akun Arbakti Anda. Silakan buka https://payment.arbakti.monster/member/pattern-notifikasi lalu buat ID Aplikasi terlebih dahulu.'
                    };
                }
            } catch (listErr) {
                console.warn('[ ARBAKTI ] Gagal mengambil list metode aktif, menggunakan fallback:', listErr.message);
            }

            candidates.push('kris');
            candidates.push('qris');
            candidates.push('qrisgopay');
        }

        // Hilangkan duplikasi dengan mempertahankan urutan
        candidates = [...new Set(candidates.filter(Boolean))];

        let lastError = null;

        // 2. Coba buat transaksi dengan metode yang ditentukan
        for (let i = 0; i < candidates.length; i++) {
            const currentMethod = candidates[i];
            const payload = {
                action: 'create',
                apikey: this.apiKey,
                amount: cleanAmount,
                paymentMethod: currentMethod
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
                        paymentMethod: d.paymentMethod || currentMethod,
                        qr_base64: d.qr_base64 || '',
                        qr_url: d.qr_url || '',
                        paymentUrl: d.paymentUrl || '',
                        expiredAt: d.expiredAt || '',
                        createdAt: d.createdAt || '',
                        message: body.message || 'QRIS berhasil dibuat'
                    };
                }

                // Jika server merespons success: false
                const errMsg = body.message || 'Gagal membuat QRIS di Arbakti';
                lastError = { status: 'error', message: errMsg, raw: body };

                if (errMsg.toLowerCase().includes('metode') || errMsg.toLowerCase().includes('tidak aktif')) {
                    console.warn(`[ ARBAKTI ] Metode '${currentMethod}' tidak aktif, mencoba alternatif...`);
                    continue; // Coba kandidat berikutnya
                }

                return lastError;
            } catch (err) {
                const resData = err.response?.data || {};
                const errMsg = resData.message || resData.error || err.message || '';
                lastError = this._handleError(err);

                // Jika error adalah metode pembayaran tidak aktif/tidak ditemukan, lanjut ke kandidat berikutnya
                const isMethodError = errMsg.toLowerCase().includes('metode') ||
                    errMsg.toLowerCase().includes('tidak aktif') ||
                    errMsg.toLowerCase().includes('not found') ||
                    err.response?.status === 404;

                if (isMethodError && i < candidates.length - 1) {
                    console.warn(`[ ARBAKTI ] Metode '${currentMethod}' gagal (${errMsg}), mencoba kandidat berikutnya...`);
                    continue;
                }

                return lastError;
            }
        }

        // 3. Jika seluruh metode gagal
        if (lastError && String(lastError.message).toLowerCase().includes('metode')) {
            const usedMethod = candidates.join(', ');
            return {
                status: 'error',
                message: `ID Aplikasi QRIS '${usedMethod}' tidak aktif atau tidak ditemukan di akun Arbakti. Pastikan ID Aplikasi sudah sesuai dengan menu Pattern Notifikasi https://payment.arbakti.monster/member/pattern-notifikasi (Gunakan perintah: .setapp [id_aplikasi] untuk mengatur).`
            };
        }

        return lastError || {
            status: 'error',
            message: 'Gagal membuat QRIS setelah mencoba semua metode pembayaran yang tersedia.'
        };
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
