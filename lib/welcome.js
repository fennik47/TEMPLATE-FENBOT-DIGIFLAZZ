const { Jimp, loadFont, HorizontalAlign } = require('jimp');
const { SANS_32_WHITE, SANS_64_WHITE, SANS_16_WHITE } = require('jimp/fonts');
const fs = require('fs');
const chalk = require('chalk');
const db = require('./db');
const lidHelper = require('./lidHelper');

module.exports = async (sock, update) => {
    try {
        const groupId = update.id;
        const action = update.action;
        
        let groupSettings = db.getGroupSettings(groupId);
        if (groupSettings && groupSettings.welcomeMode === false) return; 
        if (action !== 'add' && action !== 'remove') return;

        let groupMetadata;
        try {
            groupMetadata = await sock.groupMetadata(groupId);
            lidHelper.extractFromGroupMetadata(groupMetadata);
        } catch {
            return;
        }
        const groupName = groupMetadata.subject;

        for (let rawParticipant of update.participants) {
            const participant = lidHelper.toJid(rawParticipant);
            let ppUrl = 'https://i.ibb.co/3Fh9V6p/avatar-contact.png';
            try {
                ppUrl = await sock.profilePictureUrl(participant, 'image');
            } catch { }

            const userDb = db.getUser(participant);
            let userName = userDb && userDb.name ? userDb.name : (action === 'remove' ? "Mantan Member" : "Member Baru");

            const bgPath = action === 'add' ? './database/welcome_bg.png' : './database/goodbye_bg.png';
            let image;
            
            if (fs.existsSync(bgPath)) {
                image = await Jimp.read(bgPath);
                image.resize({ w: 800, h: 400 });
            } else {
                const bgColor = action === 'add' ? '#0f172a' : '#3f0f15';
                image = new Jimp({ width: 800, height: 400, color: bgColor });
            }
            
            try {
                const pp = await Jimp.read(ppUrl);
                pp.resize({ w: 200, h: 200 });
                if (typeof pp.circle === 'function') {
                    pp.circle();
                }
                image.composite(pp, 300, 40);
            } catch (ppErr) {
                // Ignore profile photo load failure
            }

            const font64 = await loadFont(SANS_64_WHITE);
            const font32 = await loadFont(SANS_32_WHITE);
            const font16 = await loadFont(SANS_16_WHITE);

            image.print({
                font: font64, 
                x: 0, 
                y: 250, 
                text: { text: action === 'add' ? 'WELCOME' : 'GOODBYE', alignmentX: HorizontalAlign.CENTER },
                maxWidth: 800
            });

            image.print({
                font: font32, 
                x: 0, 
                y: 320, 
                text: { text: userName, alignmentX: HorizontalAlign.CENTER },
                maxWidth: 800
            });

            image.print({
                font: font16, 
                x: 0, 
                y: 365, 
                text: { text: action === 'add' ? `To: ${groupName}` : `Left: ${groupName}`, alignmentX: HorizontalAlign.CENTER },
                maxWidth: 800
            });

            const buffer = await image.getBuffer('image/png');

            let caption = action === 'add' 
                ? `Halo @${participant.split('@')[0]} 👋\nSelamat datang di *${groupName}*!\n\nJangan lupa patuhi aturan grup ya!`
                : `Selamat tinggal @${participant.split('@')[0]} 👋\nSemoga sukses di luar sana!`;

            await sock.sendMessage(groupId, {
                image: buffer,
                caption: caption,
                mentions: [participant]
            });
        }
    } catch (err) {
        console.log(chalk.red('[ WELCOME ERROR ] ' + err));
    }
};
