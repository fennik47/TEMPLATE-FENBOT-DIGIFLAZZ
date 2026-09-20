const fs = require('fs-extra');
const path = require('path');

const mapPath = path.join(__dirname, '..', 'database', 'lid_map.json');
let lidToJidMap = {};
let jidToLidMap = {};

const loadMap = () => {
    try {
        if (fs.existsSync(mapPath)) {
            const data = fs.readJsonSync(mapPath);
            lidToJidMap = data.lidToJid || {};
            jidToLidMap = data.jidToLid || {};
        }
    } catch {
        lidToJidMap = {};
        jidToLidMap = {};
    }
};

const saveMap = () => {
    try {
        fs.ensureDirSync(path.dirname(mapPath));
        fs.writeJsonSync(mapPath, {
            lidToJid: lidToJidMap,
            jidToLid: jidToLidMap,
            updatedAt: new Date().toISOString()
        }, { spaces: 2 });
    } catch (err) {
        console.error('[ LID_MAP ] Gagal menyimpan lid_map:', err.message);
    }
};

loadMap();

const cleanId = (id) => {
    if (!id || typeof id !== 'string') return '';
    return id.replace(/:\d+@/, '@').trim();
};

const registerMapping = (lid, jid) => {
    if (!lid || !jid) return;
    const cleanLid = cleanId(lid);
    const cleanJid = cleanId(jid);

    const normLid = cleanLid.includes('@') ? (cleanLid.endsWith('@lid') ? cleanLid : cleanLid.split('@')[0] + '@lid') : cleanLid + '@lid';
    const normJid = cleanJid.includes('@') ? (cleanJid.endsWith('@s.whatsapp.net') ? cleanJid : cleanJid.split('@')[0] + '@s.whatsapp.net') : cleanJid + '@s.whatsapp.net';

    if (normLid.endsWith('@lid') && normJid.endsWith('@s.whatsapp.net')) {
        let changed = false;
        if (lidToJidMap[normLid] !== normJid) {
            lidToJidMap[normLid] = normJid;
            changed = true;
        }
        if (jidToLidMap[normJid] !== normLid) {
            jidToLidMap[normJid] = normLid;
            changed = true;
        }
        if (changed) {
            saveMap();
        }
    }
};

const toJid = (id) => {
    if (!id || typeof id !== 'string') return id;
    const cleaned = cleanId(id);

    if (cleaned.endsWith('@g.us') || cleaned === 'status@broadcast') {
        return cleaned;
    }

    if (cleaned.endsWith('@s.whatsapp.net')) {
        return cleaned;
    }

    if (cleaned.endsWith('@lid')) {
        if (lidToJidMap[cleaned]) {
            return lidToJidMap[cleaned];
        }

        const rawDigits = cleaned.split('@')[0];
        const possibleJid = rawDigits + '@s.whatsapp.net';
        if (jidToLidMap[possibleJid] === cleaned) {
            return possibleJid;
        }

        return cleaned;
    }

    const digitsOnly = cleaned.replace(/[^0-9]/g, '');
    if (digitsOnly.length >= 8 && digitsOnly.length <= 16) {
        return `${digitsOnly}@s.whatsapp.net`;
    }

    return cleaned;
};

const toLid = (id) => {
    if (!id || typeof id !== 'string') return id;
    const cleaned = cleanId(id);
    return jidToLidMap[cleaned] || cleaned;
};

const extractFromMessage = (sock, mek) => {
    if (!mek || !mek.key) return;

    if (sock?.user?.id && sock?.user?.lid) {
        registerMapping(sock.user.lid, sock.user.id);
    }

    const key = mek.key;
    if (key.participantLid && key.participantPn) {
        registerMapping(key.participantLid, key.participantPn);
    }
    if (key.senderLid && key.senderPn) {
        registerMapping(key.senderLid, key.senderPn);
    }

    if (key.participant && key.participant.endsWith('@lid') && key.participantPn) {
        registerMapping(key.participant, key.participantPn);
    }
    if (key.remoteJid && key.remoteJid.endsWith('@lid') && key.senderPn) {
        registerMapping(key.remoteJid, key.senderPn);
    }
};

const extractFromGroupMetadata = (metadata) => {
    if (!metadata || !Array.isArray(metadata.participants)) return;
    for (const p of metadata.participants) {
        if (p.lid && p.jid) {
            registerMapping(p.lid, p.jid);
        } else if (p.id && p.jid && p.id !== p.jid && p.id.endsWith('@lid')) {
            registerMapping(p.id, p.jid);
        }
    }
};

module.exports = {
    cleanId,
    registerMapping,
    toJid,
    toLid,
    extractFromMessage,
    extractFromGroupMetadata
};
