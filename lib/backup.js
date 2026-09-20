const { exec } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const config = require('../config/config');

const runBackup = async (sock, type = 'Daily') => {
    try {
        const date = new Date().toLocaleDateString('id-ID').replace(/\//g, '-');
        const fileName = `Backup_${type}_${date}.zip`;
        const outputPath = path.join(__dirname, '..', 'temp', fileName);
        
        await fs.ensureDir(path.join(__dirname, '..', 'temp'));

        // PowerShell command to zip specific folders/files including tutorial and readme
        const cmd = `PowerShell -Command "Compress-Archive -Path 'commands', 'config', 'database', 'lib', 'Assets', 'index.js', 'message.js', 'package.json', 'README.md', 'TUTORIAL.md' -DestinationPath '${outputPath}' -Force"`;

        exec(cmd, async (error, stdout, stderr) => {
            if (error) {
                console.error(`[ BACKUP ERROR ] ${error.message}`);
                return;
            }

            console.log(`[ BACKUP ] ${type} backup created: ${fileName}`);

            // Send to Owner
            const caption = `📦 *AUTO BACKUP ${type.toUpperCase()}*\n\n📅 Tanggal: ${new Date().toLocaleString('id-ID')}\n🤖 Status: Berhasil\n\n_File ini berisi database, script, dan konfigurasi bot Anda (Tanpa node_modules/session)._`;
            
            try {
                const lidHelper = require('./lidHelper');
                for (let owner of config.owner) {
                    const jid = lidHelper.toJid(owner);
                    await sock.sendMessage(jid, { 
                        document: { url: outputPath }, 
                        mimetype: 'application/zip', 
                        fileName: fileName,
                        caption: caption
                    });
                }
            } catch (uploadErr) {
                console.error(`[ BACKUP UPLOAD ERROR ] Gagal mengirim backup ke owner:`, uploadErr.message);
            }

            // Cleanup temp file after 1 hour
            setTimeout(() => fs.remove(outputPath).catch(() => {}), 3600000);
        });
    } catch (err) {
        console.error(`[ BACKUP ERROR ]`, err);
    }
};

module.exports = { runBackup };
