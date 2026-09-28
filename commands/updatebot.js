const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

module.exports = {
    name: "updatebot",
    aliases: ["update", "gitpull", "pull"],
    run: async (sock, m, { isOwner }) => {
        if (!isOwner) return sock.reply(m.chat, 'Hanya Owner yang bisa memperbarui bot!', m);

        await sock.reply(m.chat, '⏳ Memeriksa dan menarik pembaruan commit terbaru dari GitHub...', m);

        const rootDir = path.join(__dirname, '..');
        const gitDir = path.join(rootDir, '.git');

        if (!fs.existsSync(gitDir)) {
            return sock.reply(
                m.chat,
                '⚠️ Direktori `.git` tidak ditemukan di dalam container bot.\n\n' +
                'Silakan klik tombol *Sync Template* pada panel web FENBOT Cloud untuk memperbarui file bot ke commit GitHub terbaru.',
                m
            );
        }

        exec('git pull origin main', { cwd: rootDir, timeout: 30000 }, async (err, stdout, stderr) => {
            if (err) {
                return sock.reply(m.chat, `❌ Gagal menarik pembaruan Git:\n${err.message}\n\n${stderr || ''}`, m);
            }

            const output = (stdout || '').trim();
            if (output.includes('Already up to date') || output.includes('Already up-to-date')) {
                return sock.reply(m.chat, `✅ *Bot Sudah Versi Terbaru!*\n\nLog Git:\n\`\`\`${output}\`\`\``, m);
            }

            await sock.reply(
                m.chat,
                `✅ *Berhasil Update dari GitHub!*\n\nLog Git:\n\`\`\`${output}\`\`\`\n\n♻️ Merestart bot untuk menerapkan pembaruan...\n_(Catatan: Jika bot tidak otomatis terhubung kembali dalam 10 detik, silakan klik tombol Restart pada panel Pterodactyl Anda.)_`,
                m
            );

            setTimeout(() => {
                process.exit(0);
            }, 1500);
        });
    }
};
