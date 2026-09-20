const axios = require('axios');
const crypto = require('crypto');
const config = require('../config/config');

class Digiflazz {
    get username() {
        return config.digiflazz?.username || '';
    }

    get apiKey() {
        return config.digiflazz?.apiKey || '';
    }

    constructor() {
        this.baseUrl = 'https://api.digiflazz.com/v1';
    }

    generateSign(refId) {
        return crypto.createHash('md5')
            .update(this.username + this.apiKey + refId)
            .digest('hex');
    }

    async getPriceList() {
        const sign = crypto.createHash('md5')
            .update(this.username + this.apiKey + 'pricelist')
            .digest('hex');
        
        try {
            const res = await axios.post(`${this.baseUrl}/price-list`, {
                cmd: 'prepaid',
                username: this.username,
                sign: sign
            });
            return res.data.data;
        } catch (err) {
            console.error('Digiflazz Error:', err.response?.data || err.message);
            throw err;
        }
    }

    async topup(sku, customerNo, refId) {
        const sign = this.generateSign(refId);
        
        try {
            const res = await axios.post(`${this.baseUrl}/transaction`, {
                username: this.username,
                buyer_sku_code: sku,
                customer_no: customerNo,
                ref_id: refId,
                sign: sign
            });
            return res.data.data;
        } catch (err) {
            console.error('Digiflazz Topup Error:', err.response?.data || err.message);
            throw err;
        }
    }

    async checkStatus(sku, customerNo, refId) {
        const sign = this.generateSign(refId);
        
        try {
            const res = await axios.post(`${this.baseUrl}/transaction`, {
                username: this.username,
                buyer_sku_code: sku,
                customer_no: customerNo,
                ref_id: refId,
                sign: sign
            });
            return res.data.data;
        } catch (err) {
            console.error('Digiflazz Status Error:', err.response?.data || err.message);
            throw err;
        }
    }

    async getBalance() {
        const sign = crypto.createHash('md5')
            .update(this.username + this.apiKey + 'depo')
            .digest('hex');
        
        try {
            const res = await axios.post(`${this.baseUrl}/cek-saldo`, {
                cmd: 'deposit',
                username: this.username,
                sign: sign
            });
            return res.data.data;
        } catch (err) {
            console.error('Digiflazz Balance Error:', err.response?.data || err.message);
            throw new Error(err.response?.data?.data?.message || err.message);
        }
    }

    async deposit(amount, bank, name) {
        const sign = crypto.createHash('md5')
            .update(this.username + this.apiKey + 'deposit')
            .digest('hex');
        
        try {
            const res = await axios.post(`${this.baseUrl}/deposit`, {
                username: this.username,
                amount: parseInt(amount),
                Bank: bank,
                owner_name: name,
                sign: sign
            });
            return res.data.data;
        } catch (err) {
            console.error('Digiflazz Deposit Error:', err.response?.data || err.message);
            throw new Error(err.response?.data?.data?.message || err.message);
        }
    }
}

module.exports = new Digiflazz();
