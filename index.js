const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { joinVoiceChannel, getVoiceConnection, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();

// Import AI System
const AIConfig = require('./ai-config.js');

// Initialize AI
const aiSystem = new AIConfig();
console.log('🤖 AI System Loaded - Supports Darija, Arabic, French, English');

// Database setup
const db = new sqlite3.Database('./bot_data.db');

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS warnings (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, guild_id TEXT, reason TEXT, moderator TEXT, date TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS suggestions (id INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT, user_id TEXT, suggestion TEXT, date TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS giveaways (id INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT, channel_id TEXT, prize TEXT, winners INTEGER, end_time INTEGER)`);
    db.run(`CREATE TABLE IF NOT EXISTS tickets (user_id TEXT, channel_id TEXT, guild_id TEXT, created_at TEXT, PRIMARY KEY (user_id, guild_id))`);
    db.run(`CREATE TABLE IF NOT EXISTS ticket_config (guild_id TEXT PRIMARY KEY, panel_channel TEXT, category TEXT, log_channel TEXT, support_role TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS reaction_roles (guild_id TEXT, message_id TEXT, channel_id TEXT, emoji TEXT, role_id TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS verification_config (guild_id TEXT PRIMARY KEY, auto_role TEXT, verified_role TEXT, channel TEXT, image_url TEXT, setup_by TEXT, setup_at TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS user_stats (user_id TEXT PRIMARY KEY, messages INTEGER DEFAULT 0, voice_minutes INTEGER DEFAULT 0, xp INTEGER DEFAULT 0, level INTEGER DEFAULT 1)`);
    db.run(`CREATE TABLE IF NOT EXISTS free_games_sent (id INTEGER PRIMARY KEY AUTOINCREMENT, game_id TEXT UNIQUE, sent_at TEXT)`);
    console.log('✅ Database ready');
});

// Config
const { BOT_TOKEN, LOG_CHANNEL_ID, MOD_ROLE_ID, AUTO_ROLE_ID, VOICE_CHANNEL_ID, WELCOME_CHANNEL_ID } = process.env;

if (!BOT_TOKEN) {
    console.error('❌ Missing BOT_TOKEN in .env file');
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessageReactions
    ]
});

// Voice tracking
const voiceStartTimes = new Map();
const activeFreeGameSessions = new Map();
const sentGamesCache = new Set();
const linkWarnCooldown = new Map();

// Free games list
const FREE_STEAM_GAMES = [
    { id: 730, title: "Counter-Strike 2", desc: "Free-to-play competitive FPS.", image: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/730/header.jpg", price: "$0.00", url: "https://store.steampowered.com/app/730/CounterStrike_2/" },
    { id: 570, title: "Dota 2", desc: "Popular MOBA game.", image: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/570/header.jpg", price: "$0.00", url: "https://store.steampowered.com/app/570/Dota_2/" },
    { id: 440, title: "Team Fortress 2", desc: "Class-based team shooter.", image: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/440/header.jpg", price: "$0.00", url: "https://store.steampowered.com/app/440/Team_Fortress_2/" },
    { id: 1172470, title: "Apex Legends", desc: "Battle royale shooter.", image: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1172470/header.jpg", price: "$0.00", url: "https://store.steampowered.com/app/1172470/Apex_Legends/" },
    { id: 1085660, title: "Destiny 2", desc: "Action MMO FPS.", image: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1085660/header.jpg", price: "$0.00", url: "https://store.steampowered.com/app/1085660/Destiny_2/" },
    { id: 444090, title: "Paladins", desc: "Fantasy team shooter.", image: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/444090/header.jpg", price: "$0.00", url: "https://store.steampowered.com/app/444090/Paladins/" },
    { id: 230410, title: "Warframe", desc: "Co-op space ninja.", image: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/230410/header.jpg", price: "$0.00", url: "https://store.steampowered.com/app/230410/Warframe/" },
    { id: 2169380, title: "The Finals", desc: "Competitive shooter.", image: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2169380/header.jpg", price: "$0.00", url: "https://store.steampowered.com/app/2169380/THE_FINALS/" },
    { id: 1477560, title: "Rocket League", desc: "Soccer with cars!", image: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1477560/header.jpg", price: "$0.00", url: "https://store.steampowered.com/app/1477560/Rocket_League/" },
    { id: 1238840, title: "PUBG", desc: "Battle royale.", image: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1238840/header.jpg", price: "$0.00", url: "https://store.steampowered.com/app/1238840/PUBG_BATTLEGROUNDS/" }
];

async function loadSentGames() {
    return new Promise((resolve) => {
        db.all(`SELECT game_id FROM free_games_sent`, [], (err, rows) => {
            if (rows && rows.length) {
                rows.forEach(row => sentGamesCache.add(String(row.game_id)));
            }
            console.log(`📚 Loaded ${sentGamesCache.size} sent games`);
            resolve();
        });
    });
}

async function markGameAsSent(gameId) {
    return new Promise((resolve) => {
        db.run(`INSERT OR IGNORE INTO free_games_sent (game_id, sent_at) VALUES (?, ?)`, [String(gameId), new Date().toISOString()], () => {
            sentGamesCache.add(String(gameId));
            resolve();
        });
    });
}

async function getRandomFreeGame() {
    const available = FREE_STEAM_GAMES.filter(g => !sentGamesCache.has(String(g.id)));
    if (available.length === 0) {
        sentGamesCache.clear();
        db.run(`DELETE FROM free_games_sent`, []);
        return FREE_STEAM_GAMES[Math.floor(Math.random() * FREE_STEAM_GAMES.length)];
    }
    return available[Math.floor(Math.random() * available.length)];
}

async function sendFreeGameEmbed(channel, game) {
    const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle(`🎮 ${game.title}`)
        .setURL(game.url)
        .setDescription(game.desc)
        .setThumbnail(game.image)
        .setImage(game.image)
        .addFields(
            { name: '💰 Price', value: `~~${game.price}~~ → **FREE!**`, inline: true },
            { name: '🔗 Download', value: `[Get Game](${game.url})`, inline: false }
        )
        .setFooter({ text: 'Free game every 3 minutes!' })
        .setTimestamp();
    await channel.send({ embeds: [embed] });
    await markGameAsSent(game.id);
}

// Helper functions
function isMod(member) {
    if (!member) return false;
    if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
    if (MOD_ROLE_ID && member.roles.cache.has(MOD_ROLE_ID)) return true;
    return false;
}

async function sendLog(guild, action, target, mod, reason) {
    const ch = guild.channels.cache.get(LOG_CHANNEL_ID);
    if (!ch) return;
    const embed = new EmbedBuilder().setColor(0x2b2d31).setTitle(`📋 ${action}`)
        .addFields(
            { name: 'Mod', value: mod?.tag || 'System', inline: true },
            { name: 'Target', value: target?.tag || target || 'Unknown', inline: true },
            { name: 'Reason', value: reason || 'None', inline: false }
        ).setTimestamp();
    await ch.send({ embeds: [embed] });
}

async function getMember(guild, id) {
    try { return await guild.members.fetch(id); } catch { return null; }
}

function parseTime(t) {
    const m = t.match(/^(\d+)([smhd])$/);
    if (!m) return null;
    const v = parseInt(m[1]), u = m[2];
    if (u === 's') return v * 1000;
    if (u === 'm') return v * 60000;
    if (u === 'h') return v * 3600000;
    if (u === 'd') return v * 86400000;
    return null;
}

function fmtTime(ms) {
    const m = Math.floor(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
    if (d > 0) return `${d} day(s)`;
    if (h > 0) return `${h} hour(s)`;
    if (m > 0) return `${m} minute(s)`;
    return `${Math.floor(ms / 1000)} second(s)`;
}

function formatVoiceTime(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

// User stats functions
async function getUserStats(userId) {
    return new Promise((resolve) => {
        db.get(`SELECT * FROM user_stats WHERE user_id = ?`, [userId], (err, row) => {
            resolve(row || { messages: 0, voice_minutes: 0, xp: 0, level: 1 });
        });
    });
}

function updateMessageStats(userId, messages = 1) {
    db.get(`SELECT * FROM user_stats WHERE user_id = ?`, [userId], (err, row) => {
        if (!row) {
            db.run(`INSERT INTO user_stats (user_id, messages, voice_minutes, xp, level) VALUES (?, ?, ?, ?, 1)`, [userId, messages, 0, messages]);
        } else {
            let newXp = row.xp + messages;
            let newLevel = row.level;
            while (newXp >= newLevel * 100) { newXp -= newLevel * 100; newLevel++; }
            db.run(`UPDATE user_stats SET messages = messages + ?, xp = ?, level = ? WHERE user_id = ?`, [messages, newXp, newLevel, userId]);
        }
    });
}

async function updateVoiceStats(userId, additionalMinutes) {
    return new Promise((resolve) => {
        db.get(`SELECT * FROM user_stats WHERE user_id = ?`, [userId], (err, row) => {
            if (!row) {
                db.run(`INSERT INTO user_stats (user_id, messages, voice_minutes, xp, level) VALUES (?, 0, ?, ?, 1)`, [userId, additionalMinutes, Math.floor(additionalMinutes / 60)], () => resolve());
            } else {
                const newVoice = row.voice_minutes + additionalMinutes;
                let newXp = row.xp + Math.floor(additionalMinutes / 60);
                let newLevel = row.level;
                while (newXp >= newLevel * 100) { newXp -= newLevel * 100; newLevel++; }
                db.run(`UPDATE user_stats SET voice_minutes = ?, xp = ?, level = ? WHERE user_id = ?`, [newVoice, newXp, newLevel, userId], () => resolve());
            }
        });
    });
}

async function getAllStats() {
    return new Promise((resolve) => {
        db.all(`SELECT user_id, messages, voice_minutes, xp, level FROM user_stats ORDER BY xp DESC`, (err, rows) => {
            resolve(rows || []);
        });
    });
}

function addWarning(uid, gid, reason, mod) {
    return new Promise((r) => {
        db.run(`INSERT INTO warnings (user_id, guild_id, reason, moderator, date) VALUES (?, ?, ?, ?, ?)`,
            [uid, gid, reason, mod, new Date().toISOString()], () => r());
    });
}

function getWarnCount(uid, gid) {
    return new Promise((r) => {
        db.get(`SELECT COUNT(*) as c FROM warnings WHERE user_id = ? AND guild_id = ?`, [uid, gid], (err, row) => r(row ? row.c : 0));
    });
}

// Ticket system
function saveTicketConfig(gid, panel, cat, log, role) { db.run(`INSERT OR REPLACE INTO ticket_config VALUES (?, ?, ?, ?, ?)`, [gid, panel, cat, log, role]); }
function getTicketConfig(gid) { return new Promise((r) => { db.get(`SELECT * FROM ticket_config WHERE guild_id = ?`, [gid], (err, row) => r(row)); }); }
function saveTicket(uid, cid, gid) { db.run(`INSERT OR REPLACE INTO tickets VALUES (?, ?, ?, ?)`, [uid, cid, gid, new Date().toISOString()]); }
function getTicket(uid, gid) { return new Promise((r) => { db.get(`SELECT * FROM tickets WHERE user_id = ? AND guild_id = ?`, [uid, gid], (err, row) => r(row)); }); }
function delTicket(uid, gid) { db.run(`DELETE FROM tickets WHERE user_id = ? AND guild_id = ?`, [uid, gid]); }

async function sendTicketPanel(ch, cfg) {
    const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('🎫 SUPPORT').setDescription('Click below to create a ticket.').setTimestamp();
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('create_ticket').setLabel('Open Ticket').setEmoji('🎫').setStyle(ButtonStyle.Primary));
    await ch.send({ embeds: [embed], components: [row] });
}

// Reaction roles
function saveRR(gid, mid, cid, emoji, rid) { db.run(`INSERT OR REPLACE INTO reaction_roles VALUES (?, ?, ?, ?, ?)`, [gid, mid, cid, emoji, rid]); }
function getRR(gid, mid) { return new Promise((r) => { db.all(`SELECT * FROM reaction_roles WHERE guild_id = ? AND message_id = ?`, [gid, mid], (err, rows) => r(rows || [])); }); }

async function sendRRPanel(ch, phoneId, pcId) {
    const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('📱 DEVICE ROLES').setDescription('Click a button to get your role!')
        .addFields({ name: '📱 Phone', value: `<@&${phoneId}>`, inline: true }, { name: '💻 PC', value: `<@&${pcId}>`, inline: true });
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('role_phone').setLabel('Phone').setEmoji('📱').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('role_pc').setLabel('PC').setEmoji('💻').setStyle(ButtonStyle.Secondary)
    );
    const msg = await ch.send({ embeds: [embed], components: [row] });
    saveRR(ch.guild.id, msg.id, ch.id, '📱', phoneId);
    saveRR(ch.guild.id, msg.id, ch.id, '💻', pcId);
}

// Verification
function saveVerif(gid, auto, verified, ch, img, by) { db.run(`INSERT OR REPLACE INTO verification_config VALUES (?, ?, ?, ?, ?, ?, ?)`, [gid, auto, verified, ch, img, by, new Date().toISOString()]); }
function getVerif(gid) { return new Promise((r) => { db.get(`SELECT * FROM verification_config WHERE guild_id = ?`, [gid], (err, row) => r(row)); }); }

async function sendVerifPanel(ch) {
    const cfg = await getVerif(ch.guild.id);
    if (!cfg) return ch.send('❌ Not configured! Use `!verif`');
    const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('✅ VERIFY').setDescription(`Welcome to ${ch.guild.name}!\nClick below to verify.`)
        .setImage(cfg.image_url).setThumbnail(ch.guild.iconURL()).setTimestamp();
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('verify_button').setLabel('Verify').setEmoji('✅').setStyle(ButtonStyle.Success));
    await ch.send({ embeds: [embed], components: [row] });
}

// Announcements
async function sendAnn(ch, msg) {
    const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('📢 ANNOUNCEMENT').setDescription(msg).setThumbnail(ch.guild.iconURL()).setTimestamp();
    await ch.send({ embeds: [embed] });
}

// Setup collectors
async function setupTicket(msg) {
    const filter = (m) => m.author.id === msg.author.id;
    let step = 0;
    const cfg = {};
    const questions = ['Panel Channel ID:', 'Category ID:', 'Log Channel ID:', 'Support Role ID:'];
    const names = ['panel_channel', 'category', 'log_channel', 'support_role'];
    await msg.reply(questions[0]);
    const coll = msg.channel.createMessageCollector({ filter, time: 60000, max: 4 });
    coll.on('collect', async (m) => {
        cfg[names[step]] = m.content.trim();
        step++;
        if (step < 4) await m.reply(questions[step]);
        else {
            coll.stop();
            saveTicketConfig(msg.guild.id, cfg.panel_channel, cfg.category, cfg.log_channel, cfg.support_role);
            await m.reply('✅ Ticket system configured! Use `!ticket`');
        }
    });
}

async function setupRR(msg) {
    const filter = (m) => m.author.id === msg.author.id;
    let step = 0;
    const roles = {};
    const questions = ['Phone Role ID:', 'PC Role ID:'];
    await msg.reply(questions[0]);
    const coll = msg.channel.createMessageCollector({ filter, time: 60000, max: 2 });
    coll.on('collect', async (m) => {
        roles[step === 0 ? 'phone' : 'pc'] = m.content.trim();
        step++;
        if (step < 2) await m.reply(questions[step]);
        else {
            coll.stop();
            await sendRRPanel(msg.channel, roles.phone, roles.pc);
            await m.reply('✅ Reaction role panel created!');
        }
    });
}

async function setupVerif(msg) {
    const filter = (m) => m.author.id === msg.author.id;
    let step = 0;
    const cfg = {};
    const questions = ['Auto Role ID:', 'Verified Role ID:', 'Channel ID:', 'Image URL:'];
    const names = ['auto_role', 'verified_role', 'channel', 'image_url'];
    await msg.reply('🔧 Verification Setup\n' + questions[0]);
    const coll = msg.channel.createMessageCollector({ filter, time: 120000, max: 4 });
    coll.on('collect', async (m) => {
        const val = m.content.trim();
        if (step < 3 && !val.match(/^\d+$/)) return m.reply('❌ Invalid ID');
        if (step === 3 && !val.match(/^https?:\/\//)) return m.reply('❌ Invalid URL');
        cfg[names[step]] = val;
        step++;
        if (step < 4) await m.reply(questions[step]);
        else {
            coll.stop();
            saveVerif(msg.guild.id, cfg.auto_role, cfg.verified_role, cfg.channel, cfg.image_url, msg.author.id);
            const ch = msg.guild.channels.cache.get(cfg.channel);
            if (ch) await sendVerifPanel(ch);
            await m.reply(`✅ Verification configured! Panel sent to <#${cfg.channel}>`);
        }
    });
}

// Anti-link regex
const LINK_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+|discord\.gg\/[^\s]+|discord\.com\/invite\/[^\s]+)/i;

// Voice channel auto-join
let currentVoiceConnection = null;
let reconnectTimeout = null;

async function joinVoiceChannelProper() {
    if (!VOICE_CHANNEL_ID) return;
    try {
        const guild = client.guilds.cache.first();
        if (!guild) return;
        const voiceChannel = guild.channels.cache.get(VOICE_CHANNEL_ID);
        if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice) return;
        
        const existingConnection = getVoiceConnection(guild.id);
        if (existingConnection && existingConnection.joinConfig.channelId === VOICE_CHANNEL_ID) return;
        if (existingConnection) existingConnection.destroy();
        
        const connection = joinVoiceChannel({
            channelId: VOICE_CHANNEL_ID,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: false
        });
        
        currentVoiceConnection = connection;
        connection.on(VoiceConnectionStatus.Ready, () => console.log(`🎤 Joined voice channel: ${voiceChannel.name}`));
        connection.on(VoiceConnectionStatus.Disconnected, () => {
            if (!reconnectTimeout) {
                reconnectTimeout = setTimeout(() => {
                    reconnectTimeout = null;
                    joinVoiceChannelProper();
                }, 10000);
            }
        });
        await entersState(connection, VoiceConnectionStatus.Ready, 15000);
    } catch (error) {
        console.error(`❌ Voice join error: ${error.message}`);
    }
}

// Welcome message
async function sendWelcome(member) {
    const channel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
    if (!channel) return;
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`🎉 WELCOME TO ${member.guild.name.toUpperCase()} 🎉`)
        .setDescription(`Hey ${member.toString()}! Welcome to the community! ✨\n\nWe're glad to have you here.`)
        .setThumbnail(member.user.displayAvatarURL({ size: 1024, dynamic: true }))
        .setTimestamp()
        .setFooter({ text: member.guild.name });
    await channel.send({ content: `${member.toString()}`, embeds: [embed] });
}

// Voice time saving
async function saveAllVoiceTime() {
    for (const [uid, startTime] of voiceStartTimes) {
        const mins = Math.floor((Date.now() - startTime) / 60000);
        if (mins > 0) await updateVoiceStats(uid, mins);
    }
}

// ============================================
// MAIN MESSAGE HANDLER
// ============================================
client.on('messageCreate', async (message) => {
    // Ignore bots
    if (message.author.bot) return;
    
    // ========== AI 1-we COMMAND ==========
    if (message.content.toLowerCase().startsWith('1-we ')) {
        const question = message.content.substring(5).trim();
        if (question) {
            await message.channel.sendTyping();
            const response = aiSystem.generateResponse(question, message.author.id);
            return message.reply(response);
        }
        return message.reply('❌ Please ask a question after `1-we`\nExample: `1-we Salam alikom, labas?`');
    }
    
    // ========== AI \ia COMMAND ==========
    if (message.content.startsWith('\\ia')) {
        const args = message.content.slice(3).trim().split(/ +/);
        if (!args.length || !args[0]) {
            const helpEmbed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('🤖 AI Chat Command')
                .setDescription('Chat with the AI assistant in multiple languages!')
                .addFields(
                    { name: 'Usage', value: '`\\ia <your message>`', inline: false },
                    { name: 'Examples', value: '`\\ia Salam alikom, labas?`\n`\\ia How are you?`\n`\\ia Comment ça va?`\n`\\ia كيف حالك؟`', inline: false },
                    { name: 'Supported Languages', value: '🇲🇦 Darija • 🇸🇦 Arabic • 🇫🇷 French • 🇬🇧 English', inline: false }
                )
                .setTimestamp();
            return message.reply({ embeds: [helpEmbed] });
        }
        const question = args.join(' ');
        await message.channel.sendTyping();
        const response = aiSystem.generateResponse(question, message.author.id);
        return message.reply(response);
    }
    
    // ========== AI HELP COMMAND ==========
    if (message.content === '!iahelp' || message.content === '!aihelp') {
        const stats = aiSystem.getStats();
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('🤖 AI Chat System - Help')
            .setDescription('Chat with the AI assistant! Supports multiple languages including Darija (Moroccan Arabic).')
            .addFields(
                { name: '📝 Commands', value: '`\\ia <message>` - Chat with AI\n`1-we <question>` - Quick AI response\n`!iahelp` - Show this help', inline: false },
                { name: '🌍 Language Support', value: '🇲🇦 **Darija** (الدارجة)\n🇸🇦 **Arabic** (العربية)\n🇫🇷 **French** (Français)\n🇬🇧 **English**', inline: false },
                { name: '💡 Examples', value: '`\\ia Salam alikom, labas?`\n`1-we شنو أخبارك؟`\n`\\ia Comment ça va aujourd'hui?`', inline: false },
                { name: '📊 Statistics', value: `Active users: ${stats.activeUsers}\n🗣️ Darija: ${stats.languages.darija}\n📖 Arabic: ${stats.languages.arabic}\n🇫🇷 French: ${stats.languages.french}\n🇬🇧 English: ${stats.languages.english}`, inline: true }
            )
            .setFooter({ text: 'AI remembers your language preference for 30 minutes' })
            .setTimestamp();
        return message.reply({ embeds: [embed] });
    }
    
    // Skip non-command messages
    if (!message.content.startsWith('!')) return;
    
    const args = message.content.slice(1).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();
    const { member, guild, channel } = message;
    
    const modCmds = ['ban', 'kick', 'mute', 'unmute', 'warn', 'clear', 'lock', 'unlock', 'giverole', 'removerole', 'unban', 'ann', 'anni', 'ticketsetup', 'ticket', 'roltest', 'verif', 'sendpanel', 'verifstatus', 'resetverif', 'freegame', 'stopfreegame'];
    if (modCmds.includes(cmd) && !isMod(member)) return message.reply('❌ Permission denied!');
    
    // HELP
    if (cmd === 'help') {
        const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('🛡️ Commands')
            .setDescription('**Moderation:** `!ban`, `!kick`, `!mute`, `!unmute`, `!warn`, `!clear`, `!lock`, `!unlock`, `!giverole`, `!removerole`, `!unban`')
            .addFields(
                { name: '🤖 AI Chat', value: '`\\ia <message>` - Chat with AI\n`1-we <question>` - Quick AI\n`!iahelp` - AI help', inline: false },
                { name: '🎮 Free Games', value: '`!freegame` - Start free games\n`!stopfreegame` - Stop', inline: false },
                { name: 'ℹ️ Info', value: '`!userinfo`, `!serverinfo`, `!avatar`, `!info`', inline: false },
                { name: '📊 Stats', value: '`!rank`, `!top`, `!messages`, `!voice`', inline: false },
                { name: '📢 Announcements', value: '`!ann`, `!anni`', inline: false },
                { name: '🎫 Ticket', value: '`!ticketsetup`, `!ticket`', inline: false },
                { name: '🎭 Reaction Roles', value: '`!roltest`', inline: false },
                { name: '✅ Verification', value: '`!verif`, `!sendpanel`, `!verifstatus`, `!resetverif`', inline: false }
            ).setTimestamp();
        return message.reply({ embeds: [embed] });
    }
    
    // SERVER INFO
    if (cmd === 'serverinfo') {
        const total = guild.memberCount;
        const online = guild.members.cache.filter(m => m.presence?.status === 'online' || m.presence?.status === 'idle' || m.presence?.status === 'dnd').size;
        const voice = guild.members.cache.filter(m => m.voice.channel).size;
        const boosts = guild.premiumSubscriptionCount || 0;
        const level = guild.premiumTier;
        const created = `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`;
        const embed = new EmbedBuilder().setColor(0x5865F2).setAuthor({ name: guild.name, iconURL: guild.iconURL() })
            .setTitle(`📊 SERVER STATISTICS`).setThumbnail(guild.iconURL({ size: 1024 }))
            .addFields(
                { name: '👤 MEMBERS', value: `**${total.toLocaleString()}** Total`, inline: true },
                { name: '🟢 ONLINE', value: `**${online}** Online`, inline: true },
                { name: '🎤 VOICE', value: `**${voice}** In Voice`, inline: true },
                { name: '🚀 BOOSTS', value: `**${boosts}** Boosts (Level ${level})`, inline: true },
                { name: '📅 CREATED', value: `${created}`, inline: true }
            ).setTimestamp();
        await message.reply({ embeds: [embed] });
        return;
    }
    
    // FREE GAMES
    if (cmd === 'freegame') {
        if (activeFreeGameSessions.has(channel.id)) return message.reply('❌ Already running!');
        await message.reply('🎮 Starting free games...');
        const game = await getRandomFreeGame();
        await sendFreeGameEmbed(channel, game);
        const interval = setInterval(async () => {
            const newGame = await getRandomFreeGame();
            await sendFreeGameEmbed(channel, newGame);
        }, 180000);
        activeFreeGameSessions.set(channel.id, interval);
        return;
    }
    
    if (cmd === 'stopfreegame') {
        const interval = activeFreeGameSessions.get(channel.id);
        if (interval) {
            clearInterval(interval);
            activeFreeGameSessions.delete(channel.id);
            message.reply('⏹️ Stopped.');
        } else message.reply('❌ No active session.');
        return;
    }
    
    // STATS
    if (cmd === 'info') {
        let target = member.user;
        if (args[0]) { try { target = await client.users.fetch(args[0]); } catch(e) { return message.reply('❌ User not found'); } }
        const stats = await getUserStats(target.id);
        const allStats = await getAllStats();
        const rank = allStats.findIndex(s => s.user_id === target.id) + 1 || allStats.length + 1;
        const embed = new EmbedBuilder().setColor(0x5865F2).setTitle(`📊 ${target.tag}`).setThumbnail(target.displayAvatarURL())
            .addFields(
                { name: '📈 Level', value: `Level ${stats.level} | Rank #${rank}`, inline: true },
                { name: '💬 Messages', value: `${stats.messages.toLocaleString()}`, inline: true },
                { name: '🎤 Voice', value: `${formatVoiceTime(stats.voice_minutes)}`, inline: true }
            ).setTimestamp();
        await message.reply({ embeds: [embed] });
        return;
    }
    
    if (cmd === 'rank') {
        let target = member.user;
        if (args[0]) { try { target = await client.users.fetch(args[0]); } catch(e) { return message.reply('❌ User not found'); } }
        const stats = await getUserStats(target.id);
        const allStats = await getAllStats();
        const rank = allStats.findIndex(s => s.user_id === target.id) + 1 || allStats.length + 1;
        const xpNeeded = stats.level * 100;
        const progress = Math.floor((stats.xp / xpNeeded) * 100);
        const bar = '█'.repeat(Math.floor(progress / 5)) + '░'.repeat(20 - Math.floor(progress / 5));
        const embed = new EmbedBuilder().setColor(0x5865F2).setTitle(`🏆 ${target.tag} - #${rank}`)
            .setDescription(`**Level ${stats.level}**\n\`${bar}\` ${progress}%`)
            .addFields({ name: 'XP', value: `${Math.floor(stats.xp)} / ${xpNeeded} XP`, inline: true });
        await message.reply({ embeds: [embed] });
        return;
    }
    
    if (cmd === 'top') {
        const type = args[0] === 'messages' ? 'messages' : (args[0] === 'voice' ? 'voice' : 'xp');
        const allStats = await getAllStats();
        const sorted = [...allStats].sort((a, b) => {
            if (type === 'xp') return b.xp - a.xp;
            if (type === 'messages') return b.messages - a.messages;
            return b.voice_minutes - a.voice_minutes;
        });
        const top10 = sorted.slice(0, 10);
        let desc = '';
        for (let i = 0; i < top10.length; i++) {
            const user = await client.users.fetch(top10[i].user_id).catch(() => null);
            const name = user ? user.username : 'Unknown';
            if (type === 'xp') desc += `${i+1}. **${name}** - Lvl ${top10[i].level}\n`;
            else if (type === 'messages') desc += `${i+1}. **${name}** - ${top10[i].messages.toLocaleString()} msgs\n`;
            else desc += `${i+1}. **${name}** - ${formatVoiceTime(top10[i].voice_minutes)}\n`;
        }
        const titles = { xp: 'XP', messages: 'Messages', voice: 'Voice' };
        const embed = new EmbedBuilder().setColor(0x5865F2).setTitle(`🏆 ${titles[type]} Leaderboard`).setDescription(desc || 'No data');
        await message.reply({ embeds: [embed] });
        return;
    }
    
    // Other commands (simplified versions)
    if (cmd === 'userinfo') {
        const target = args[0] ? await getMember(guild, args[0]) : member;
        if (!target) return message.reply('❌ Not found');
        const warns = await getWarnCount(target.id, guild.id);
        const embed = new EmbedBuilder().setColor(0x5865F2).setTitle(target.user.tag).setThumbnail(target.user.displayAvatarURL())
            .addFields({ name: 'Joined', value: `<t:${Math.floor(target.joinedTimestamp / 1000)}:R>`, inline: true }, { name: 'Warnings', value: `${warns}`, inline: true });
        await message.reply({ embeds: [embed] });
        return;
    }
    
    if (cmd === 'avatar') {
        const user = args[0] ? await client.users.fetch(args[0]) : message.author;
        const embed = new EmbedBuilder().setColor(0x5865F2).setTitle(`${user.tag}'s Avatar`).setImage(user.displayAvatarURL({ size: 1024 }));
        await message.reply({ embeds: [embed] });
        return;
    }
    
    if (cmd === 'ann') {
        const text = args.join(' ');
        if (!text) return message.reply('Usage: `!ann <message>`');
        await message.delete();
        await sendAnn(channel, text);
        return;
    }
    
    if (cmd === 'suggest') {
        const sug = args.join(' ');
        if (!sug) return message.reply('Usage: `!suggest <message>`');
        const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('💡 Suggestion').setDescription(sug).setAuthor({ name: member.user.tag });
        const msg = await channel.send({ embeds: [embed] });
        await msg.react('✅'); await msg.react('❌');
        await message.reply('✅ Submitted!');
        return;
    }
    
    // Moderation commands
    if (cmd === 'ban' && args[0]) {
        const target = await getMember(guild, args[0]);
        if (!target) return message.reply('❌ Not found');
        const reason = args.slice(1).join(' ') || 'No reason';
        await target.ban({ reason });
        await message.reply(`✅ Banned ${target.user.tag}`);
        return;
    }
    
    if (cmd === 'kick' && args[0]) {
        const target = await getMember(guild, args[0]);
        if (!target) return message.reply('❌ Not found');
        const reason = args.slice(1).join(' ') || 'No reason';
        await target.kick(reason);
        await message.reply(`✅ Kicked ${target.user.tag}`);
        return;
    }
    
    if (cmd === 'mute' && args[0] && args[1]) {
        const target = await getMember(guild, args[0]);
        if (!target) return message.reply('❌ Not found');
        const ms = parseTime(args[1]);
        if (!ms) return message.reply('❌ Invalid time');
        const reason = args.slice(2).join(' ') || 'No reason';
        await target.timeout(ms, reason);
        await message.reply(`✅ Muted ${target.user.tag} for ${fmtTime(ms)}`);
        return;
    }
    
    if (cmd === 'unmute' && args[0]) {
        const target = await getMember(guild, args[0]);
        if (!target) return message.reply('❌ Not found');
        await target.timeout(null);
        await message.reply(`✅ Unmuted ${target.user.tag}`);
        return;
    }
    
    if (cmd === 'clear' && args[0]) {
        const amount = parseInt(args[0]);
        if (!amount || amount < 1 || amount > 100) return message.reply('Usage: `!clear <1-100>`');
        const fetched = await channel.messages.fetch({ limit: amount });
        const deleted = await channel.bulkDelete(fetched);
        const reply = await message.reply(`✅ Deleted ${deleted.size} messages`);
        setTimeout(() => reply.delete(), 3000);
        return;
    }
    
    if (cmd === 'lock') {
        await channel.permissionOverwrites.edit(guild.id, { SendMessages: false });
        message.reply('🔒 Locked');
        return;
    }
    
    if (cmd === 'unlock') {
        await channel.permissionOverwrites.edit(guild.id, { SendMessages: null });
        message.reply('🔓 Unlocked');
        return;
    }
    
    // Setup commands
    if (cmd === 'ticketsetup') { await setupTicket(message); return; }
    if (cmd === 'ticket') { 
        const cfg = await getTicketConfig(guild.id);
        if (!cfg) return message.reply('❌ Not configured');
        const pc = guild.channels.cache.get(cfg.panel_channel);
        if (pc) await sendTicketPanel(pc, cfg);
        message.reply(`✅ Panel sent to ${pc}`);
        return;
    }
    
    if (cmd === 'roltest') { await setupRR(message); return; }
    if (cmd === 'verif') { await setupVerif(message); return; }
    if (cmd === 'sendpanel') {
        const cfg = await getVerif(guild.id);
        if (!cfg) return message.reply('❌ Not configured');
        const ch = guild.channels.cache.get(cfg.channel);
        if (ch) await sendVerifPanel(ch);
        message.reply(`✅ Panel sent`);
        return;
    }
});

// Anti-link handler
client.on('messageCreate', async (message) => {
    if (message.author?.bot || !message.guild) return;
    if (message.content.startsWith('!') || message.content.startsWith('\\ia') || message.content.startsWith('1-we')) return;
    if (isMod(message.member)) return;
    if (LINK_REGEX.test(message.content)) {
        await message.delete().catch(() => {});
        const now = Date.now();
        const lastWarn = linkWarnCooldown.get(message.author.id);
        if (!lastWarn || now - lastWarn > 10000) {
            linkWarnCooldown.set(message.author.id, now);
            setTimeout(() => linkWarnCooldown.delete(message.author.id), 10000);
            const warnMsg = await message.channel.send(`${message.author} ry7 t9wd mra jaya`);
            setTimeout(() => warnMsg.delete().catch(() => {}), 3000);
        }
        await message.member.timeout(60000).catch(() => {});
    }
});

// Voice tracking
client.on('voiceStateUpdate', async (old, neu) => {
    const uid = neu.member?.id || old.member?.id;
    if (!uid) return;
    if (!old.channelId && neu.channelId) voiceStartTimes.set(uid, Date.now());
    else if (old.channelId && !neu.channelId && voiceStartTimes.has(uid)) {
        const mins = Math.floor((Date.now() - voiceStartTimes.get(uid)) / 60000);
        if (mins > 0) await updateVoiceStats(uid, mins);
        voiceStartTimes.delete(uid);
    }
});

// Member join/leave
client.on('guildMemberAdd', async (member) => {
    await sendWelcome(member);
    const vcfg = await getVerif(member.guild.id);
    if (vcfg?.auto_role) await member.roles.add(vcfg.auto_role);
    else if (AUTO_ROLE_ID) await member.roles.add(AUTO_ROLE_ID);
});

// Message stats
client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.guild) return;
    if (msg.content.startsWith('!') || msg.content.startsWith('\\ia') || msg.content.startsWith('1-we')) return;
    updateMessageStats(msg.author.id, 1);
});

// Button interactions
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;
    
    if (interaction.customId === 'verify_button') {
        const cfg = await getVerif(interaction.guild.id);
        if (!cfg) return interaction.reply({ content: '❌ Not configured', ephemeral: true });
        if (cfg.auto_role && interaction.member.roles.cache.has(cfg.auto_role)) await interaction.member.roles.remove(cfg.auto_role);
        await interaction.member.roles.add(cfg.verified_role);
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x22C55E).setTitle('✅ Verified!')], ephemeral: true });
    }
    
    if (interaction.customId === 'role_phone' || interaction.customId === 'role_pc') {
        const roles = await getRR(interaction.guild.id, interaction.message.id);
        const targetEmoji = interaction.customId === 'role_phone' ? '📱' : '💻';
        const role = roles.find(r => r.emoji === targetEmoji);
        if (role) {
            const r = interaction.guild.roles.cache.get(role.role_id);
            if (r) {
                if (interaction.member.roles.cache.has(r.id)) await interaction.member.roles.remove(r);
                else await interaction.member.roles.add(r);
                await interaction.reply({ content: `✅ ${interaction.member.roles.cache.has(r.id) ? 'Removed' : 'Added'} ${r.name}`, ephemeral: true });
            }
        }
    }
    
    if (interaction.customId === 'create_ticket') {
        const existing = await getTicket(interaction.user.id, interaction.guild.id);
        if (existing) return interaction.reply({ content: `❌ You have a ticket: <#${existing.channel_id}>`, ephemeral: true });
        const cfg = await getTicketConfig(interaction.guild.id);
        if (!cfg?.category) return interaction.reply({ content: '❌ Not configured', ephemeral: true });
        const ch = await interaction.guild.channels.create({
            name: `ticket-${interaction.user.username}`,
            type: ChannelType.GuildText,
            parent: cfg.category,
            permissionOverwrites: [
                { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                ...(cfg.support_role ? [{ id: cfg.support_role, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }] : [])
            ]
        });
        saveTicket(interaction.user.id, ch.id, interaction.guild.id);
        const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('🎫 Ticket Created');
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('close_ticket').setLabel('Close').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claim').setStyle(ButtonStyle.Secondary)
        );
        await ch.send({ content: `${interaction.user}`, embeds: [embed], components: [row] });
        await interaction.reply({ content: `✅ Ticket: ${ch}`, ephemeral: true });
    }
    
    if (interaction.customId === 'close_ticket') {
        if (!isMod(interaction.member)) return interaction.reply({ content: '❌ No permission', ephemeral: true });
        await delTicket(interaction.user.id, interaction.guild.id);
        await interaction.reply('🔒 Closing...');
        setTimeout(() => interaction.channel.delete(), 3000);
    }
});

// Ready event
client.once('ready', async () => {
    await loadSentGames();
    console.log(`✅ ${client.user.tag} is online!`);
    console.log(`🤖 AI Chat System Ready`);
    console.log(`📝 Commands: 1-we <question> | \\ia <message> | !iahelp`);
    console.log(`🌍 Languages: Darija, Arabic, French, English`);
    client.user.setActivity('1-we or \\ia', { type: 3 });
    setTimeout(() => joinVoiceChannelProper(), 3000);
});

// Shutdown
async function gracefulShutdown() {
    await saveAllVoiceTime();
    for (const interval of activeFreeGameSessions.values()) clearInterval(interval);
    if (currentVoiceConnection) currentVoiceConnection.destroy();
    db.close(() => process.exit(0));
}
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
process.on('unhandledRejection', (err) => console.error('Error:', err.message));

client.login(BOT_TOKEN);
