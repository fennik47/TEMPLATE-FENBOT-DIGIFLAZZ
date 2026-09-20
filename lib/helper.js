const moment = require('moment-timezone');
const { getContentType } = require('@whiskeysockets/baileys');

const getMsgType = (m) => {
    return m.message ? getContentType(m.message) : null;
};

const getWIBTime = () => {
    return moment.tz('Asia/Jakarta').format('HH:mm:ss');
};

const getWIBDate = () => {
    return moment.tz('Asia/Jakarta').format('DD/MM/YYYY');
};

module.exports = {
    getMsgType,
    getWIBTime,
    getWIBDate
};
