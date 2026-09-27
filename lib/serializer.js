const { getContentType, jidDecode, downloadContentFromMessage } = require('@whiskeysockets/baileys');
const fs = require('fs-extra');
const path = require('path');
const lidHelper = require('./lidHelper');

const decodeJid = (jid) => {
    if (!jid) return jid;
    let decoded = jid;
    if (/:\d+@/gi.test(jid)) {
        const decode = jidDecode(jid) || {};
        decoded = (decode.user && decode.server && decode.user + '@' + decode.server) || jid;
    }
    return lidHelper.toJid(decoded);
};

const serialize = (sock, m) => {
    if (!m) return m;
    lidHelper.extractFromMessage(sock, m);
    if (m.key) {
        m.id = m.key.id;
        m.isBot = m.id.startsWith('BAE5') && m.id.length === 16;
        m.chat = decodeJid(m.key.remoteJid);
        m.fromMe = m.key.fromMe;
        m.isGroup = m.chat.endsWith('@g.us');
        
        // Prioritaskan nomor telepon asli (senderPn / participantPn) agar tidak pernah menghasilkan @lid
        const rawSender = m.fromMe 
            ? (sock?.user?.id || '') 
            : (m.key.senderPn || m.key.participantPn || m.participant || m.key.participant || m.chat || '');
        m.sender = decodeJid(rawSender);

        // Auto-register LID mapping seketika
        if (m.key.participant && m.key.participant.endsWith('@lid') && m.sender && m.sender.endsWith('@s.whatsapp.net')) {
            lidHelper.registerMapping(m.key.participant, m.sender);
        }
        if (m.key.remoteJid && m.key.remoteJid.endsWith('@lid') && m.sender && m.sender.endsWith('@s.whatsapp.net')) {
            lidHelper.registerMapping(m.key.remoteJid, m.sender);
        }

        // Jika chat pribadi dan salah satu berformat LID dan lainnya JID, sinkronkan ke JID
        if (!m.isGroup) {
            if (m.chat && m.chat.endsWith('@lid') && m.sender && m.sender.endsWith('@s.whatsapp.net')) {
                lidHelper.registerMapping(m.chat, m.sender);
                m.chat = m.sender;
            } else if (m.sender && m.sender.endsWith('@lid') && m.chat && m.chat.endsWith('@s.whatsapp.net')) {
                lidHelper.registerMapping(m.sender, m.chat);
                m.sender = m.chat;
            }
        }
    }

    if (m.message) {
        m.type = getContentType(m.message);
        if (m.type === 'ephemeralMessage') {
            m.message = m.message.ephemeralMessage.message;
            m.type = getContentType(m.message);
        }
        m.msg = (m.type === 'viewOnceMessageV2' ? m.message.viewOnceMessageV2.message[getContentType(m.message.viewOnceMessageV2.message)] : m.message[m.type]);
        
        if (m.type === 'viewOnceMessageV2') m.type = getContentType(m.message.viewOnceMessageV2.message);
        
        m.body = (m.type === 'conversation') ? m.message.conversation : 
                 (m.type === 'extendedTextMessage') ? m.message.extendedTextMessage.text : 
                 (m.type === 'imageMessage') ? m.message.imageMessage.caption : 
                 (m.type === 'videoMessage') ? m.message.videoMessage.caption : 
                 (m.type === 'buttonsResponseMessage') ? m.message.buttonsResponseMessage.selectedButtonId : 
                 (m.type === 'listResponseMessage') ? m.message.listResponseMessage.singleSelectReply.selectedRowId : 
                 (m.type === 'templateButtonReplyMessage') ? m.message.templateButtonReplyMessage.selectedId : 
                 (m.type === 'messageContextInfo') ? (m.message.buttonsResponseMessage?.selectedButtonId || m.message.listResponseMessage?.singleSelectReply.selectedRowId || m.text) : '';
        
        m.quoted = (m.msg && m.msg.contextInfo) ? m.msg.contextInfo.quotedMessage : null;
        if (m.quoted) {
            let type = getContentType(m.quoted);
            m.quoted = m.quoted[type];
            if (m.quoted) {
                if (['extendedTextMessage', 'viewOnceMessageV2'].includes(type)) {
                    type = getContentType(m.quoted);
                    m.quoted = m.quoted[type];
                }
                if (m.quoted) {
                    m.quoted.type = type;
                    m.quoted.id = m.msg.contextInfo.stanzaId;
                    m.quoted.chat = decodeJid(m.msg.contextInfo.remoteJid || m.chat);
                    m.quoted.isBot = m.quoted.id ? m.quoted.id.startsWith('BAE5') && m.quoted.id.length === 16 : false;
                    m.quoted.sender = decodeJid(m.msg.contextInfo.participant);
                    m.quoted.fromMe = m.quoted.sender === decodeJid(sock.user.id);
                    m.quoted.text = m.quoted.text || m.quoted.caption || m.quoted.conversation || m.quoted.contentText || m.quoted.selectedDisplayText || m.quoted.title || '';
                    
                    m.quoted.download = () => downloadMedia(m.quoted);
                }
            }
        }
    }

    m.download = () => downloadMedia(m.msg);

    const downloadMedia = async (msg) => {
        let message = msg.message ? msg.message[getContentType(msg.message)] : msg;
        
        let streamType = 'image';
        if (message.mimetype) {
            if (message.mimetype.includes('video')) streamType = 'video';
            else if (message.mimetype.includes('audio')) streamType = 'audio';
            else if (message.mimetype.includes('pdf') || message.mimetype.includes('document')) streamType = 'document';
            else if (message.mimetype.includes('sticker')) streamType = 'sticker';
        }
        
        try {
            let stream = await downloadContentFromMessage(message, streamType);
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }
            return buffer;
        } catch (err) {
            console.error('[ DOWNLOAD ERROR ]', err);
            throw err;
        }
    };

    sock.reply = (jid, text, quoted, options = {}) => {
        const target = lidHelper.toJid(jid) || jid;
        return sock.sendMessage(target, { text, ...options }, { quoted });
    };

    return m;
};

module.exports = { serialize, decodeJid };
