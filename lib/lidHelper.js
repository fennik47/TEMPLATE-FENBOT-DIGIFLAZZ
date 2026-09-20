const fs = require('fs');
const path = require('path');

const mapPath = path.join(__dirname, '..', 'database', 'lid_map.json');
let lidToJidMap = {};
let jidToLidMap = {};

const loadMap = () => {
    try {
        if (fs.existsSync(mapPath)) {
            const raw = fs.readFileSync(mapPath, 'utf8');
            const data = JSON.parse(raw);
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
        const dir = path.dirname(mapPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(mapPath, JSON.stringify({
            lidToJid: lidToJidMap,
            jidToLid: jidToLidMap,
            updatedAt: new Date().toISOString()
        }, null, 2), 'utf8');
    } catch (err) {
        console.error('[ LID_MAP ] Gagal menyimpan lid_map:', err.message);
    }
};

loadMap();

/**
 * Normalisasi nomor HP ke format standar internasional (628xxx)
 */
const formatPhone = (phone) => {
    if (!phone || typeof phone !== 'string') return '';
    let digits = phone.replace(/[^0-9]/g, '');
    if (digits.startsWith('08')) {
        digits = '62' + digits.slice(1);
    } else if (digits.startsWith('8') && digits.length >= 9 && digits.length <= 13) {
        digits = '62' + digits;
    }
    return digits;
};

/**
 * Membersihkan ID Baileys dari device suffix (:12@)
 */
const cleanId = (id) => {
    if (!id || typeof id !== 'string') return '';
    return id.replace(/:\d+@/, '@').trim();
};

const isLid = (id) => {
    if (!id || typeof id !== 'string') return false;
    return id.trim().endsWith('@lid');
};

const registerMapping = (lid, jid) => {
    if (!lid || !jid) return;
    const cleanLid = cleanId(lid);
    const cleanJid = cleanId(jid);

    const normLid = cleanLid.includes('@')
        ? (cleanLid.endsWith('@lid') ? cleanLid : cleanLid.split('@')[0] + '@lid')
        : cleanLid + '@lid';

    let normJid = cleanJid;
    if (!cleanJid.endsWith('@g.us') && !cleanJid.endsWith('@lid')) {
        const phoneDigits = formatPhone(cleanJid);
        if (phoneDigits.length >= 8) {
            normJid = `${phoneDigits}@s.whatsapp.net`;
        } else if (!normJid.includes('@')) {
            normJid = `${normJid}@s.whatsapp.net`;
        }
    }

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

        const lidBare = normLid.split('@')[0];
        if (lidToJidMap[lidBare] !== normJid) {
            lidToJidMap[lidBare] = normJid;
            changed = true;
        }

        if (changed) {
            saveMap();
        }
    }
};

/**
 * Konversi LID ke JID secara menyeluruh & konsisten
 */
const toJid = (id) => {
    if (!id || typeof id !== 'string') return '';
    const cleaned = cleanId(id);

    if (cleaned.endsWith('@g.us') || cleaned === 'status@broadcast') {
        return cleaned;
    }

    if (cleaned.endsWith('@s.whatsapp.net')) {
        const rawUser = cleaned.split('@')[0];
        const formatted = formatPhone(rawUser);
        if (formatted && formatted.length >= 8) {
            return `${formatted}@s.whatsapp.net`;
        }
        return cleaned;
    }

    if (cleaned.endsWith('@lid') || /^\d{14,18}$/.test(cleaned)) {
        const fullLid = cleaned.endsWith('@lid') ? cleaned : `${cleaned}@lid`;
        const bareLid = fullLid.split('@')[0];

        if (lidToJidMap[fullLid]) return lidToJidMap[fullLid];
        if (lidToJidMap[bareLid]) return lidToJidMap[bareLid];

        // Cek database users lokal jika ada linkedTo
        try {
            const usersPath = path.join(__dirname, '..', 'database', 'users.json');
            if (fs.existsSync(usersPath)) {
                const users = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
                if (users[fullLid]?.linkedTo) return users[fullLid].linkedTo;
                if (users[bareLid]?.linkedTo) return users[bareLid].linkedTo;
            }
        } catch { }

        return fullLid;
    }

    // Jika berupa angka polos nomor telepon
    const digits = formatPhone(cleaned);
    if (digits.length >= 8 && digits.length <= 16) {
        return `${digits}@s.whatsapp.net`;
    }

    return cleaned;
};

const toLid = (id) => {
    if (!id || typeof id !== 'string') return id;
    const cleaned = cleanId(id);
    return jidToLidMap[cleaned] || cleaned;
};

const toPhone = (id) => {
    const jid = toJid(id);
    if (!jid) return '';
    const raw = jid.split('@')[0];
    return formatPhone(raw);
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
    if (key.remoteJid && key.remoteJid.endsWith('@lid') && key.participantPn) {
        registerMapping(key.remoteJid, key.participantPn);
    }

    // Context Info (Quoted)
    const ctx = mek.message?.extendedTextMessage?.contextInfo;
    if (ctx?.participant && ctx?.participant.endsWith('@lid') && ctx?.participantPn) {
        registerMapping(ctx.participant, ctx.participantPn);
    }
};

const extractFromGroupMetadata = (metadata) => {
    if (!metadata || !Array.isArray(metadata.participants)) return;
    for (const p of metadata.participants) {
        if (p.lid && (p.jid || p.id)) {
            registerMapping(p.lid, p.jid || p.id);
        } else if (p.id && p.id.endsWith('@lid') && p.jid) {
            registerMapping(p.id, p.jid);
        }
    }
};

module.exports = {
    cleanId,
    formatPhone,
    isLid,
    registerMapping,
    toJid,
    toLid,
    toPhone,
    extractFromMessage,
    extractFromGroupMetadata
};
