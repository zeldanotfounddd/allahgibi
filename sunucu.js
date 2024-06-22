const net = require('net');
const fs = require('fs');
const { Webhook, MessageBuilder } = require('discord-webhook-node');

// Discord Webhook bilgileri
const webhookURL = 'https://discord.com/api/webhooks/1254065379702083604/H6MU1dMUAyXaddVIdm9e7YvB5LAoM59hd4ShSh80k5m6E4kCCiSO30KjgNhkIRsWAPih';
const webhook = new Webhook(webhookURL);

// TCP sunucusu için port numarası
const TCP_PORT = 46972;
const MAX_CONNECTIONS_PER_IP = 2; // Her IP adresinden en fazla 1 bağlantı kabul edilecek
const activeConnections = {};
const activeAddresses = {};
const dailyLogsPath = 'logs/log.json';

const tcpServer = net.createServer(socket => {
    const clientAddress = socket.remoteAddress;
    if (activeAddresses[clientAddress] && activeAddresses[clientAddress] >= MAX_CONNECTIONS_PER_IP) {
        console.log(`[SKYLE] ${clientAddress} IP adresinden zaten maksimum bağlantı sayısına ulaşıldı. Yeni bağlantı kabul edilmiyor.`);
        return;
    }
    activeAddresses[clientAddress] = (activeAddresses[clientAddress] || 0) + 1;

    console.log('[SKYLE] Bir bağlantı alındı. User IP:', clientAddress);

    // Bağlantı geldiğinde current time ve exptime bilgilerini konsola yazdır
    const currentDate = new Date();
    console.log('Suan Ki Zaman:', currentDate.toLocaleString());

    // Yeni bağlantıyı listeye ekle
    activeConnections[clientAddress] = socket;

    socket.on('data', data => {
        console.log('[SKYLE] Gelen veri:', data.toString());
        const message = data.toString();
        sendMessageToDiscord(message, clientAddress);
        // Veriyi işleme
        processMessage(message, socket, currentDate, clientAddress);
    });

    socket.on('end', () => {
        console.log('[SKYLE] Bağlantı sonlandırıldı.');
        // Bağlantı sonlandığında listeden çıkar
        delete activeConnections[clientAddress];
        activeAddresses[clientAddress]--;
    });

    socket.on('error', err => {
        console.error('Beklenmedik şekilde kapandı program ? :', err.message);
        // Handle the error as needed
        delete activeConnections[clientAddress];
        activeAddresses[clientAddress]--;
    });
});

function processMessage(message, socket, currentDate, clientAddress) {
    const keyMatch = message.match(/key:(.*?)\s/);
    const hwidMatch = message.match(/hwid:(.*?)\s/);
    const versionMatch = message.match(/version:(.*?)\s/);
    const pcMatch = message.match(/pc:(.*)$/);

    if (!keyMatch || !hwidMatch || !versionMatch || !pcMatch) {
        console.log("Geçersiz mesaj formatı.");
        return;
    }

    const key = keyMatch[1];
    const hwid = hwidMatch[1];
    const version = versionMatch[1];

    fs.readFile('keys/version.json', 'utf8', (err, data) => {
        if (err) {
            console.error(err);
            return;
        }

        const versionData = JSON.parse(data);
        const vdurum = versionData.vdurum;

        if (!vdurum) {
            sendMessageToDiscord('**Giris basarisiz oldu!** (V-SunucuKapalı)', clientAddress);
            socket.write('vdurum');
            console.log('[SKYLE] Vdurum mesajı gönderildi.');
            return;
        }

        if (versionData.version !== version) {
            sendMessageToDiscord('**Giris basarisiz oldu!** (VersiyonEski)', clientAddress);
            socket.write('notversion');
            console.log('[SKYLE] Notversion mesajı gönderildi.');
            return;
        }

        fs.readFile('keys/users.json', 'utf8', (err, data) => {
            if (err) {
                console.error(err);
                return;
            }

            let users = JSON.parse(data);
            if (users.hasOwnProperty(key) && users[key].hwid === '') {
                users[key].hwid = hwid;
                fs.writeFile('keys/users.json', JSON.stringify(users, null, 2), 'utf8', err => {
                    if (err) {
                        console.error(err);
                        return;
                    }
                    console.log('[SKYLE] Kullanıcıya hwid değeri atandı.');
                });
            }

            if (!users.hasOwnProperty(key)) {
                sendMessageToDiscord('**Giris basarisiz oldu!** (HatalıKey)', clientAddress);
                socket.write('notkey');
                console.log('[SKYLE] Notkey mesajı gönderildi.');
				updateDailyFailedLoginCount();
                return;
            }
			
			if (users[key].freekey === 'true') {
				sendMessageToDiscord('**Giris basarili oldu!** (FREEKEY)', clientAddress);
				socket.write('authaccess');
				console.log('[SKYLE] Authaccess mesajı gönderildi. (FREEKEY)');
				// Günlük erişim sayısını güncelle (freekey için de güncelleme yapabilirsiniz)
				updateDailyAccessLoginCount();
				return; // Eğer freekey ise, diğer kontrolleri atla
			}

            if (users[key].hwid !== hwid) {
                sendMessageToDiscord('**Giris basarisiz oldu!** (HwidFarklı)', clientAddress);
                socket.write('nothwid');
                console.log('[SKYLE] Nothwid mesajı gönderildi.');
				updateDailyFailedHwidCount();
                return;
            }

            const expirationDate = new Date(users[key].exptime);
            console.log('Bitis Suresi:', expirationDate.toLocaleString());
            if (currentDate > expirationDate) {
                sendMessageToDiscord('**Giris basarisiz oldu!** (SüresiDolmuş)', clientAddress);
                socket.write('exptime');
                console.log('[SKYLE] Exptime mesajı gönderildi.');
                return;
            }

            sendMessageToDiscord('**Giris basarili oldu!**', clientAddress);
            socket.write('authaccess');
            console.log('[SKYLE] Authaccess mesajı gönderildi.');

            // Günlük erişim sayısını güncelle
            updateDailyAccessLoginCount();
        });
    });
}

function sendMessageToDiscord(message, clientAddress) {
    const embed = new MessageBuilder()
        .setTitle('Yeni Bağlantı')
        .setColor('#0099ff')
        .setDescription(`Kullanici IP: **${clientAddress}**\n Gelen Mesaj :\n${message}`);
    
    webhook.send(embed);
}

function updateDailyAccessLoginCount() {
    fs.readFile(dailyLogsPath, 'utf8', (err, data) => {
        if (err) {
            console.error(err);
            return;
        }

        let dailyLogs = JSON.parse(data);
        dailyLogs.alldailylogs.dailyaccesslogin++;

        fs.writeFile(dailyLogsPath, JSON.stringify(dailyLogs, null, 2), 'utf8', err => {
            if (err) {
                console.error(err);
                return;
            }
            console.log('[SKYLE] Günlük erişim sayısı güncellendi:', dailyLogs.alldailylogs.dailyaccesslogin);
        });
    });
}

function updateDailyFailedLoginCount() {
    fs.readFile(dailyLogsPath, 'utf8', (err, data) => {
        if (err) {
            console.error(err);
            return;
        }

        let dailyLogs = JSON.parse(data);
        dailyLogs.alldailylogs.dailyfailedkeylogin++;

        fs.writeFile(dailyLogsPath, JSON.stringify(dailyLogs, null, 2), 'utf8', err => {
            if (err) {
                console.error(err);
                return;
            }
            console.log('[SKYLE] Günlük yanlış erişim sayısı güncellendi:', dailyLogs.alldailylogs.dailyfailedkeylogin);
        });
    });
}

function updateDailyFailedHwidCount() {
    fs.readFile(dailyLogsPath, 'utf8', (err, data) => {
        if (err) {
            console.error(err);
            return;
        }

        let dailyLogs = JSON.parse(data);
        dailyLogs.alldailylogs.dailyfailedhwidlogin++;

        fs.writeFile(dailyLogsPath, JSON.stringify(dailyLogs, null, 2), 'utf8', err => {
            if (err) {
                console.error(err);
                return;
            }
            console.log('[SKYLE] Günlük yanlış hwid sayısı güncellendi:', dailyLogs.alldailylogs.dailyfailedhwidlogin);
        });
    });
}


setInterval(() => {
    // Şu anki tarih ve saat bilgisini al
    const currentDate = new Date();

    // Eğer şu an 00:00 ise günlük log dosyasını sıfırla
    if (currentDate.getHours() === 0 && currentDate.getMinutes() === 0) {
        resetDailyLogs();
    }
}, 10000);

function resetDailyLogs() {
    const dailyLogsPath = 'logs/log.json';
    const resetData = {
        alldailylogs: {
            dailyaccesslogin: 0,
            dailyfailedkeylogin: 0,
            dailyfailedhwidlogin: 0
        }
    };

    // Günlük log dosyasını sıfırla
    fs.writeFile(dailyLogsPath, JSON.stringify(resetData, null, 2), 'utf8', err => {
        if (err) {
            console.error(err);
            return;
        }
        console.log('[SKYLE] Günlük log dosyası sıfırlandı.');
    });
}

// TCP sunucusunu başlatıyoruz
tcpServer.listen(TCP_PORT, () => {
    console.log(`akira & userxdd: ${TCP_PORT}`);
});
