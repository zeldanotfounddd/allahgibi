const net = require('net');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const fetch = require('node-fetch');
const { Webhook, MessageBuilder } = require('discord-webhook-node');
const { Client, Intents } = require('discord.js');

// Discord Webhook configuration
const webhookURL = 'https://discord.com/api/webhooks/1254065379702083604/H6MU1dMUAyXaddVIdm9e7YvB5LAoM59hd4ShSh80k5m6E4kCCiSO30KjgNhkIRsWAPih';
const webhook = new Webhook(webhookURL);

// TCP server configuration
const TCP_PORT = 46972;
const MAX_CONNECTIONS_PER_IP = 2;
const activeConnections = {};
const activeAddresses = {};
const dailyLogsPath = 'logs/log.json';

// Discord bot configuration
const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES] });
const prefix = ',';
const usersFilePath = 'keys/users.json';
const channelId = '1253870746099388607';
const allowedUsers = ['1241059919377989695', '1202636040716681287', '840963144259338241'];
const downloadPath = 'C:\\client\\';

// Start the TCP server
const tcpServer = net.createServer(socket => {
    const clientAddress = socket.remoteAddress;
    if (activeAddresses[clientAddress] && activeAddresses[clientAddress] >= MAX_CONNECTIONS_PER_IP) {
        console.log(`[SKYLE] ${clientAddress} IP address has reached the maximum connection limit. New connection rejected.`);
        return;
    }
    activeAddresses[clientAddress] = (activeAddresses[clientAddress] || 0) + 1;

    console.log('[SKYLE] A connection has been received. User IP:', clientAddress);

    const currentDate = new Date();
    console.log('Current Time:', currentDate.toLocaleString());

    activeConnections[clientAddress] = socket;

    socket.on('data', data => {
        console.log('[SKYLE] Incoming data:', data.toString());
        const message = data.toString();
        sendMessageToDiscord(message, clientAddress);
        processMessage(message, socket, currentDate, clientAddress);
    });

    socket.on('end', () => {
        console.log('[SKYLE] Connection terminated.');
        delete activeConnections[clientAddress];
        activeAddresses[clientAddress]--;
    });

    socket.on('error', err => {
        console.error('Unexpected closure:', err.message);
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
        console.log("Invalid message format.");
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
            sendMessageToDiscord('**Login failed!** (ServerClosed)', clientAddress);
            socket.write('vdurum');
            console.log('[SKYLE] Vdurum message sent.');
            return;
        }

        if (versionData.version !== version) {
            sendMessageToDiscord('**Login failed!** (VersionMismatch)', clientAddress);
            socket.write('notversion');
            console.log('[SKYLE] Notversion message sent.');
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
                    console.log('[SKYLE] Assigned hwid value to user.');
                });
            }

            if (!users.hasOwnProperty(key)) {
                sendMessageToDiscord('**Login failed!** (InvalidKey)', clientAddress);
                socket.write('notkey');
                console.log('[SKYLE] Notkey message sent.');
                updateDailyFailedLoginCount();
                return;
            }

            if (users[key].freekey === 'true') {
                sendMessageToDiscord('**Login successful!** (FREEKEY)', clientAddress);
                socket.write('authaccess');
                console.log('[SKYLE] Authaccess message sent. (FREEKEY)');
                updateDailyAccessLoginCount();
                return;
            }

            if (users[key].hwid !== hwid) {
                sendMessageToDiscord('**Login failed!** (HwidMismatch)', clientAddress);
                socket.write('nothwid');
                console.log('[SKYLE] Nothwid message sent.');
                updateDailyFailedHwidCount();
                return;
            }

            const expirationDate = new Date(users[key].exptime);
            console.log('Expiration Time:', expirationDate.toLocaleString());
            if (currentDate > expirationDate) {
                sendMessageToDiscord('**Login failed!** (Expired)', clientAddress);
                socket.write('exptime');
                console.log('[SKYLE] Exptime message sent.');
                return;
            }

            sendMessageToDiscord('**Login successful!**', clientAddress);
            socket.write('authaccess');
            console.log('[SKYLE] Authaccess message sent.');

            updateDailyAccessLoginCount();
        });
    });
}

function sendMessageToDiscord(message, clientAddress) {
    const embed = new MessageBuilder()
        .setTitle('New Connection')
        .setColor('#0099ff')
        .setDescription(`User IP: **${clientAddress}**\n Incoming Message:\n${message}`);

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
            console.log('[SKYLE] Updated daily access count:', dailyLogs.alldailylogs.dailyaccesslogin);
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
            console.log('[SKYLE] Updated daily failed login count:', dailyLogs.alldailylogs.dailyfailedkeylogin);
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
            console.log('[SKYLE] Updated daily failed hwid count:', dailyLogs.alldailylogs.dailyfailedhwidlogin);
        });
    });
}

setInterval(() => {
    const currentDate = new Date();

    if (currentDate.getHours() === 0 && currentDate.getMinutes() === 0) {
        resetDailyLogs();
    }
}, 10000);

function resetDailyLogs() {
    const resetData = {
        alldailylogs: {
            dailyaccesslogin: 0,
            dailyfailedkeylogin: 0,
            dailyfailedhwidlogin: 0
        }
    };

    fs.writeFile(dailyLogsPath, JSON.stringify(resetData, null, 2), 'utf8', err => {
        if (err) {
            console.error(err);
            return;
        }
        console.log('[SKYLE] Daily log file reset.');
    });
}

tcpServer.listen(TCP_PORT, () => {
    console.log(`akira & userxdd: ${TCP_PORT}`);
});

// Discord bot commands and functionality
client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    client.user.setActivity('akiracik auth systems', { type: 'WATCHING' });

    const logChannel = client.channels.cache.get(channelId);
    if (logChannel) {
        logChannel.send('System re-opened.');
    }
});

client.on('messageCreate', async message => {
    if (!allowedUsers.includes(message.author.id)) return;
    if (!message.content.startsWith(prefix) || message.author.bot) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'hwid') {
        handleHwidCommand(args, message);
    } else if (command === 'exptime') {
        handleExptimeCommand(args, message);
    } else if (command === 'renew') {
        handleRenewCommand(args, message);
    } else if (command === 'version') {
        handleVersionCommand(args, message);
    } else if (command === 'vdurum') {
        handleVdurumCommand(args, message);
    } else if (command === 'file') {
        handleFileCommand(message);
    }
});

async function handleHwidCommand(args, message) {
    if (args.length < 1) {
        message.reply('Please provide a key.');
        return;
    }

    const key = args[0];

    try {
        const users = JSON.parse(await fs.promises.readFile(usersFilePath, 'utf8'));
        if (!users.hasOwnProperty(key)) {
            message.reply('Invalid key provided.');
            return;
        }

        users[key].hwid = '';
        await fs.promises.writeFile(usersFilePath, JSON.stringify(users, null, 2), 'utf8');

        message.reply(`HWID reset for key ${key}.`);
    } catch (err) {
        console.error(err);
        message.reply('Error occurred while resetting HWID.');
    }
}

async function handleExptimeCommand(args, message) {
    if (args.length < 2) {
        message.reply('Please provide a key and expiration time.');
        return;
    }

    const key = args[0];
    const newExptime = args[1];

    try {
        const users = JSON.parse(await fs.promises.readFile(usersFilePath, 'utf8'));
        if (!users.hasOwnProperty(key)) {
            message.reply('Invalid key provided.');
            return;
        }

        users[key].exptime = newExptime;
        await fs.promises.writeFile(usersFilePath, JSON.stringify(users, null, 2), 'utf8');

        message.reply(`Expiration time updated for key ${key}.`);
    } catch (err) {
        console.error(err);
        message.reply('Error occurred while updating expiration time.');
    }
}

async function handleRenewCommand(args, message) {
    if (args.length < 1) {
        message.reply('Please provide a key.');
        return;
    }

    const key = args[0];
    const date = new Date();
    const newExptime = new Date(date.setMonth(date.getMonth() + 1));

    try {
        const users = JSON.parse(await fs.promises.readFile(usersFilePath, 'utf8'));
        if (!users.hasOwnProperty(key)) {
            message.reply('Invalid key provided.');
            return;
        }

        users[key].exptime = newExptime.toISOString();
        await fs.promises.writeFile(usersFilePath, JSON.stringify(users, null, 2), 'utf8');

        message.reply(`Renewed key ${key} until ${newExptime.toISOString()}.`);
    } catch (err) {
        console.error(err);
        message.reply('Error occurred while renewing key.');
    }
}

async function handleVersionCommand(args, message) {
    if (args.length < 1) {
        message.reply('Please provide a version.');
        return;
    }

    const newVersion = args[0];

    try {
        const versionData = JSON.parse(await fs.promises.readFile('keys/version.json', 'utf8'));
        versionData.version = newVersion;
        await fs.promises.writeFile('keys/version.json', JSON.stringify(versionData, null, 2), 'utf8');

        message.reply(`Version updated to ${newVersion}.`);
    } catch (err) {
        console.error(err);
        message.reply('Error occurred while updating version.');
    }
}

async function handleVdurumCommand(args, message) {
    if (args.length < 1) {
        message.reply('Please provide a status (true/false).');
        return;
    }

    const newStatus = args[0].toLowerCase() === 'true';

    try {
        const versionData = JSON.parse(await fs.promises.readFile('keys/version.json', 'utf8'));
        versionData.vdurum = newStatus;
        await fs.promises.writeFile('keys/version.json', JSON.stringify(versionData, null, 2), 'utf8');

        message.reply(`Vdurum updated to ${newStatus}.`);
    } catch (err) {
        console.error(err);
        message.reply('Error occurred while updating vdurum.');
    }
}

async function handleFileCommand(message) {
    const url = '';
    const fileName = '';
    const filePath = path.join(downloadPath, fileName);

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        
        const fileStream = fs.createWriteStream(filePath);
        response.body.pipe(fileStream);

        fileStream.on('finish', () => {
            message.reply(`File downloaded: ${filePath}`);
        });
    } catch (err) {
        console.error(err);
        message.reply('Error occurred while downloading the file.');
    }
}

client.login('YOUR_DISCORD_BOT_TOKEN');
