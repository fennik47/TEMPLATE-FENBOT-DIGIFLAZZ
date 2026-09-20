const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

async function build() {
    console.log('\n======================================');
    console.log('🚀 MEMULAI PROSES BUILD SC DIGIFLAZZ');
    console.log('======================================\n');

    const sourceDir = __dirname;
    const tempDir = path.join(__dirname, '..', 'SC DIGIFLAZZ V1_TEMP');
    const zipFile = path.join(__dirname, 'SC DIGIFLAZZ V1.ZIP');

    // 1. Bersihkan sisa build lama
    if (fs.existsSync(tempDir)) fs.removeSync(tempDir);
    if (fs.existsSync(zipFile)) fs.removeSync(zipFile);

    // 2. Copy file (Exclude folder/file rahasia)
    console.log('[1/5] Menyalin file sumber (mengabaikan kredensial & node_modules)...');
    fs.copySync(sourceDir, tempDir, {
        filter: (src) => {
            const basename = path.basename(src);
            return !['node_modules', 'session', 'firebase-key.json', 'SC DIGIFLAZZ V1.ZIP', 'SC DIGIFLAZZ V1', 'build-sc.js', '.git'].includes(basename);
        }
    });

    // 3. Bersihkan config.js
    console.log('[2/5] Membersihkan API Key dan data Owner di config.js...');
    const configPath = path.join(tempDir, 'config', 'config.js');
    if (fs.existsSync(configPath)) {
        let configStr = fs.readFileSync(configPath, 'utf8');
        configStr = configStr.replace(/username:\s*['"][^'"]*['"]/g, "username: 'USERNAME_DIGIFLAZZ_ANDA'");
        configStr = configStr.replace(/apiKey:\s*['"][^'"]*['"]/g, "apiKey: 'APIKEY_DIGIFLAZZ_ANDA'");
        configStr = configStr.replace(/owner:\s*\[.*?\]/g, "owner: ['628123456789']");
        configStr = configStr.replace(/firebaseUrl:\s*['"][^'"]*['"]/g, "firebaseUrl: ''");
        fs.writeFileSync(configPath, configStr);
    }

    // 4. Reset Database
    console.log('[3/5] Mengosongkan data pelanggan, transaksi, & settings...');
    const dbDir = path.join(tempDir, 'database');
    const databases = ['users.json', 'groups.json', 'transactions.json'];
    databases.forEach(db => {
        if (fs.existsSync(path.join(dbDir, db))) {
            fs.writeFileSync(path.join(dbDir, db), '{}');
        }
    });
    // Reset settings to default structure
    if (fs.existsSync(path.join(dbDir, 'settings.json'))) {
        fs.writeFileSync(path.join(dbDir, 'settings.json'), JSON.stringify({
            margins: { BRONZE: 0.05, SILVER: 0.03, GOLD: 0.01, OWNER: 0.00 },
            autoProcess: true
        }, null, 2));
    }
    // Clear manual products
    if (fs.existsSync(path.join(dbDir, 'manual_products.json'))) {
        fs.writeFileSync(path.join(dbDir, 'manual_products.json'), '[]');
    }

    // 5. Reset Payment
    console.log('[4/5] Mereset data rekening & QRIS...');
    const paymentPath = path.join(tempDir, 'config', 'payment.json');
    if (fs.existsSync(paymentPath)) {
        fs.writeFileSync(paymentPath, JSON.stringify({ rekening: [], qris: "" }, null, 2));
    }
    const qrisPath = path.join(dbDir, 'qris.png');
    if (fs.existsSync(qrisPath)) fs.removeSync(qrisPath);

    // 6. Membuat ZIP menggunakan PowerShell
    console.log('[5/5] Membuat file ZIP rapi...');
    try {
        execSync(`powershell -Command "Compress-Archive -Path '..\\SC DIGIFLAZZ V1_TEMP\\*' -DestinationPath '.\\SC DIGIFLAZZ V1.ZIP' -Force"`, { stdio: 'inherit' });

        // 7. Cleanup temp folder after zip
        fs.removeSync(tempDir);

        console.log('\n✅ BERHASIL! File [SC DIGIFLAZZ V1.ZIP] sudah jadi dan siap dijual!');
    } catch (e) {
        console.error('\n❌ Gagal membuat ZIP. Folder SC DIGIFLAZZ V1_TEMP sudah dibuat, Anda bisa men-zip foldernya secara manual (Klik Kanan -> Compress to ZIP file).');
    }
}

build();
