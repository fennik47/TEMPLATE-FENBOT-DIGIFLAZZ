const config = require("../config/config");

module.exports = {
    name: "owner",
    run: async (sock, m) => {
        const ownerName = config.ownerName || 'Owner';
        const storeName = config.storeName || config.botName || 'Bot Store';
        const primaryOwner = Array.isArray(config.owner) ? config.owner[0] : config.owner;
        
        const vcard = 'BEGIN:VCARD\n' // metadata of the contact card
            + 'VERSION:3.0\n' 
            + 'FN:' + ownerName + '\n' // full name
            + 'ORG:' + storeName + ';\n' // the organization of the contact
            + 'TEL;type=CELL;type=VOICE;waid=' + primaryOwner + ':+' + primaryOwner + '\n' // WhatsApp ID + phone number
            + 'END:VCARD';
        
        await sock.sendMessage(m.chat, {
            contacts: {
                displayName: ownerName,
                contacts: [{ vcard }]
            }
        }, { quoted: m });
    }
};
