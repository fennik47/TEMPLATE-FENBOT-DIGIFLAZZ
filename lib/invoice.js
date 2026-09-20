const { Jimp, loadFont } = require('jimp');
const { SANS_32_WHITE, SANS_16_WHITE } = require('jimp/fonts');
const path = require('path');
const fs = require('fs-extra');

const createInvoice = async (data) => {
    try {
        const templatePath = path.join(__dirname, '..', 'Assets', 'invoice_template.png');
        if (!fs.existsSync(templatePath)) {
            console.error('[ INVOICE ] Template tidak ditemukan!');
            return null;
        }

        const image = await Jimp.read(templatePath);
        const font = await loadFont(SANS_32_WHITE);
        const fontSmall = await loadFont(SANS_16_WHITE);

        // Menggunakan posisi Y - 12px (approx) dari posisi canvas baseline lama
        const dateStr = new Date().toLocaleDateString('id-ID');
        const timeStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';
        const waktu = `${dateStr} ${timeStr}`;

        // Header Section (Upper Row)
        image.print({ font: fontSmall, x: 86, y: 122, text: waktu }); // Waktu
        image.print({ font: fontSmall, x: 259, y: 122, text: data.id }); // Lokasi invoice
        
        // Detail Section (Blue Box)
        // PRODUK
        image.print({ font: fontSmall, x: 177, y: 176, text: data.product_name });
        
        // TUJUAN
        image.print({ font: fontSmall, x: 177, y: 216, text: data.target });
        
        // NICKNAME EXTRACTOR
        let finalNickname = data.nickname;
        if (!finalNickname) {
            if (data.sn && typeof data.sn === 'string' && isNaN(data.sn.replace(/\s/g, ''))) {
                // Jika SN bukan full angka (berarti kemungkinan berisi nickname game)
                // Format biasa: "Fennik / 12345678" atau "Fennik, 12345678"
                finalNickname = data.sn.split('/')[0].split(',')[0].trim();
            } else {
                finalNickname = data.target.split(' ')[0]; // Fallback ke nomor target
            }
        }

        // NICKNAME
        image.print({ font: fontSmall, x: 177, y: 258, text: finalNickname });
        
        // SN
        if (data.sn) {
            image.print({ font: fontSmall, x: 177, y: 301, text: data.sn });
        }

        const outputPath = path.join(__dirname, '..', 'temp', `inv_${data.id}.png`);
        await fs.ensureDir(path.join(__dirname, '..', 'temp'));
        await image.write(outputPath);
        
        return outputPath;
    } catch (err) {
        console.error('[ INVOICE ERROR ]', err);
        return null;
    }
};

module.exports = { createInvoice };
