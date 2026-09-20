try {
    require('dotenv').config();
} catch {}

const parseList = (str, defaultList) => {
    if (!str) return defaultList;
    if (Array.isArray(str)) return str;
    return str.split(',').map(s => s.trim()).filter(Boolean);
};

module.exports = {
    owner: parseList(process.env.OWNER_NUMBER, ["628123456789"]),
    ownerName: process.env.OWNER_NAME || "Fennik",
    botName: process.env.BOT_NAME || "Fennik Bot",
    storeName: process.env.STORE_NAME || "Fennik Store",
    prefix: parseList(process.env.PREFIX, [".", "!", "/"]),
    digiflazz: {
        username: process.env.DIGIFLAZZ_USERNAME || "YOUR_DIGIFLAZZ_USERNAME",
        apiKey: process.env.DIGIFLAZZ_API_KEY || "YOUR_DIGIFLAZZ_API_KEY"
    },
    firebaseUrl: process.env.FIREBASE_URL || "",
    port: process.env.PORT || 3000
};