const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
require('dotenv').config();

// ============================================
// DATABASE
// ============================================
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

// ============================================
// CONFIG
// ============================================
const { BOT_TOKEN, LOG_CHANNEL_ID, MOD_ROLE_ID, AUTO_ROLE_ID, WELCOME_IMAGE_URL } = process.env;
if (!BOT_TOKEN) { console.error('❌ Missing BOT_TOKEN'); process.exit(1); }

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

// ============================================
// STORAGE
// ============================================
const spamMap = new Map();
const voiceStartTimes = new Map();
const activeFreeGameSessions = new Map();
const sentGamesCache = new Set();

// ============================================
// FREE GAMES
// ============================================
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
            if (rows) rows.forEach(row => sentGamesCache.add(String(row.game_id)));
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

// ============================================
// HELPERS
// ============================================
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

// ============================================
// USER STATS
// ============================================
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

// ============================================
// TICKET SYSTEM
// ============================================
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

// ============================================
// REACTION ROLES
// ============================================
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

// ============================================
// VERIFICATION
// ============================================
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

// ============================================
// ANNOUNCEMENTS
// ============================================
async function sendAnn(ch, msg) {
    const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('📢 ANNOUNCEMENT').setDescription(msg).setThumbnail(ch.guild.iconURL()).setTimestamp();
    await ch.send({ embeds: [embed] });
}

async function sendWelcome(ch) {
    const embed = new EmbedBuilder().setColor(0x5865F2).setTitle(`🌟 WELCOME TO ${ch.guild.name.toUpperCase()} 🌟`).setDescription('> Thank you for joining!')
        .setThumbnail(ch.guild.iconURL()).setImage(WELCOME_IMAGE_URL || 'https://media.discordapp.net/attachments/1462437612647088335/1482006389843824670/content.png')
        .addFields(
            { name: '📢 Announcements', value: 'Stay updated', inline: false },
            { name: '📜 Rules', value: 'Read the rules', inline: false },
            { name: '🎭 Roles', value: 'Use !roltest', inline: false },
            { name: '🔧 Commands', value: 'Use !help', inline: false }
        ).setTimestamp();
    await ch.send({ embeds: [embed] });
}

// ============================================
// SETUP COLLECTORS
// ============================================
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

// ============================================
// STATS COMMANDS
// ============================================
async function cmdInfo(message, targetUser) {
    const stats = await getUserStats(targetUser.id);
    const member = await getMember(message.guild, targetUser.id);
    if (!member) return message.reply('❌ User not found');
    const warns = await getWarnCount(targetUser.id, message.guild.id);
    const allStats = await getAllStats();
    const rank = allStats.findIndex(s => s.user_id === targetUser.id) + 1 || allStats.length + 1;
    const xpNeeded = stats.level * 100;
    const progress = Math.floor((stats.xp / xpNeeded) * 100);
    const embed = new EmbedBuilder().setColor(0x5865F2).setTitle(`📊 ${targetUser.tag}`).setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
        .addFields(
            { name: '🆔 Info', value: `**ID:** ${targetUser.id}\n**Created:** <t:${Math.floor(targetUser.createdTimestamp / 1000)}:R>`, inline: true },
            { name: '📅 Server', value: `**Joined:** <t:${Math.floor(member.joinedTimestamp / 1000)}:R>\n**Roles:** ${member.roles.cache.size}`, inline: true },
            { name: '📈 Level', value: `**Level ${stats.level}**\n**XP:** ${Math.floor(stats.xp)} / ${xpNeeded} (${progress}%)\n**Rank:** #${rank}`, inline: true },
            { name: '📊 Activity', value: `**Messages:** ${stats.messages.toLocaleString()}\n**Voice:** ${formatVoiceTime(stats.voice_minutes)}\n**Warnings:** ${warns}`, inline: true }
        ).setTimestamp();
    await message.reply({ embeds: [embed] });
}

// ============================================
// TRACKING
// ============================================
client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.guild) return;
    updateMessageStats(msg.author.id, 1);
});

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

client.on('messageDelete', async (msg) => {
    if (!msg.guild || msg.author?.bot) return;
    const ch = msg.guild.channels.cache.get(LOG_CHANNEL_ID);
    if (!ch) return;
    const embed = new EmbedBuilder().setColor(0xEF4444).setTitle('🗑️ Deleted').addFields(
        { name: 'Author', value: msg.author?.tag || 'Unknown', inline: true },
        { name: 'Channel', value: `<#${msg.channel.id}>`, inline: true },
        { name: 'Content', value: msg.content?.slice(0, 500) || 'None', inline: false }
    ).setTimestamp();
    await ch.send({ embeds: [embed] });
});

client.on('messageUpdate', async (old, neu) => {
    if (!old.guild || old.author?.bot || old.content === neu.content) return;
    const ch = old.guild.channels.cache.get(LOG_CHANNEL_ID);
    if (!ch) return;
    const embed = new EmbedBuilder().setColor(0x3B82F6).setTitle('✏️ Edited').addFields(
        { name: 'Author', value: old.author?.tag || 'Unknown', inline: true },
        { name: 'Channel', value: `<#${old.channel.id}>`, inline: true },
        { name: 'Before', value: old.content?.slice(0, 500) || 'Empty', inline: false },
        { name: 'After', value: neu.content?.slice(0, 500) || 'Empty', inline: false }
    ).setTimestamp();
    await ch.send({ embeds: [embed] });
});

client.on('guildMemberAdd', async (member) => {
    const ch = member.guild.channels.cache.get(LOG_CHANNEL_ID);
    if (ch) {
        const embed = new EmbedBuilder().setColor(0x22C55E).setTitle('👋 Joined').setDescription(`${member.user.tag} joined`).setThumbnail(member.user.displayAvatarURL()).setTimestamp();
        await ch.send({ embeds: [embed] });
    }
    const vcfg = await getVerif(member.guild.id);
    if (vcfg?.auto_role) await member.roles.add(vcfg.auto_role);
    else if (AUTO_ROLE_ID) await member.roles.add(AUTO_ROLE_ID);
});

client.on('guildMemberRemove', async (member) => {
    const ch = member.guild.channels.cache.get(LOG_CHANNEL_ID);
    if (!ch) return;
    const embed = new EmbedBuilder().setColor(0xEF4444).setTitle('👋 Left').setDescription(`${member.user.tag} left`).setThumbnail(member.user.displayAvatarURL()).setTimestamp();
    await ch.send({ embeds: [embed] });
});

// Anti-spam/link
client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.guild || isMod(msg.member)) return;
    const now = Date.now();
    const key = `${msg.author.id}_${msg.channel.id}`;
    const timestamps = spamMap.get(key) || [];
    timestamps.push(now);
    const recent = timestamps.filter(t => now - t < 5000);
    spamMap.set(key, recent);
    if (recent.length > 5) {
        await msg.delete();
        const w = await msg.channel.send(`${msg.author}, no spam!`);
        setTimeout(() => w.delete(), 3000);
        return;
    }
    if (/(https?:\/\/[^\s]+|discord\.gg\/[^\s]+)/i.test(msg.content)) {
        await msg.delete();
        const w = await msg.channel.send(`${msg.author}, no links!`);
        setTimeout(() => w.delete(), 5000);
    }
});

// ============================================
// BUTTONS
// ============================================
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    if (interaction.customId === 'verify_button') {
        const cfg = await getVerif(interaction.guild.id);
        if (!cfg) return interaction.reply({ content: '❌ Not configured', ephemeral: true });
        try {
            if (cfg.auto_role && interaction.member.roles.cache.has(cfg.auto_role)) await interaction.member.roles.remove(cfg.auto_role);
            await interaction.member.roles.add(cfg.verified_role);
            await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x22C55E).setTitle('✅ Verified!').setDescription(`Welcome!`)], ephemeral: true });
        } catch(e) { interaction.reply({ content: '❌ Failed', ephemeral: true }); }
    }
    else if (interaction.customId === 'role_phone' || interaction.customId === 'role_pc') {
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
    else if (interaction.customId === 'create_ticket') {
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
                { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
                ...(cfg.support_role ? [{ id: cfg.support_role, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }] : [])
            ]
        });
        saveTicket(interaction.user.id, ch.id, interaction.guild.id);
        const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('🎫 Ticket Created').setDescription('Support will help you soon.').setTimestamp();
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('close_ticket').setLabel('Close').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claim').setStyle(ButtonStyle.Secondary)
        );
        await ch.send({ content: `${interaction.user}`, embeds: [embed], components: [row] });
        await interaction.reply({ content: `✅ Ticket: ${ch}`, ephemeral: true });
    }
    else if (interaction.customId === 'close_ticket') {
        if (!isMod(interaction.member)) return interaction.reply({ content: '❌ No permission', ephemeral: true });
        await delTicket(interaction.user.id, interaction.guild.id);
        await interaction.reply('🔒 Closing...');
        setTimeout(() => interaction.channel.delete(), 3000);
    }
    else if (interaction.customId === 'claim_ticket') {
        if (!isMod(interaction.member)) return interaction.reply({ content: '❌ No permission', ephemeral: true });
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x22C55E).setTitle('🎫 Claimed').setDescription(`${interaction.user} claimed this ticket`)] });
    }
});

// ============================================
// SAVE VOICE TIME
// ============================================
async function saveAllVoiceTime() {
    for (const [uid, startTime] of voiceStartTimes) {
        const mins = Math.floor((Date.now() - startTime) / 60000);
        if (mins > 0) await updateVoiceStats(uid, mins);
    }
}

// ============================================
// COMMANDS
// ============================================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith('!')) return;
    const args = message.content.slice(1).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();
    const { member, guild, channel } = message;

    const modCmds = ['ban', 'kick', 'mute', 'unmute', 'warn', 'clear', 'lock', 'unlock', 'giverole', 'removerole', 'unban', 'ann', 'anni', 'ticketsetup', 'ticket', 'giveaway', 'roltest', 'verif', 'sendpanel', 'verifstatus', 'resetverif', 'freegame', 'stopfreegame'];
    if (modCmds.includes(cmd) && !isMod(member)) return message.reply('❌ Permission denied!');

    // HELP
    if (cmd === 'help') {
        const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('🛡️ Commands')
            .setDescription('**Moderation:** `!ban`, `!kick`, `!mute`, `!unmute`, `!warn`, `!clear`, `!lock`, `!unlock`, `!giverole`, `!removerole`, `!unban`')
            .addFields(
                { name: '🎮 Free Games', value: '`!freegame` - Start free games\n`!stopfreegame` - Stop', inline: false },
                { name: 'ℹ️ Info', value: '`!userinfo`, `!serverinfo`, `!avatar`, `!info`', inline: false },
                { name: '📊 Stats', value: '`!rank`, `!top`, `!messages`, `!voice`', inline: false },
                { name: '📢 Announcements', value: '`!ann`, `!anni`', inline: false },
                { name: '🎫 Ticket', value: '`!ticketsetup`, `!ticket`', inline: false },
                { name: '🎭 Reaction Roles', value: '`!roltest`', inline: false },
                { name: '✅ Verification', value: '`!verif`, `!sendpanel`, `!verifstatus`, `!resetverif`', inline: false },
                { name: '💡 Other', value: '`!suggest`, `!giveaway`', inline: false }
            ).setTimestamp();
        return message.reply({ embeds: [embed] });
    }

    // ========== SERVERINFO (Simple & Professional) ==========
    if (cmd === 'serverinfo') {
        const total = guild.memberCount;
        const online = guild.members.cache.filter(m => m.presence?.status === 'online').size;
        const voice = guild.members.cache.filter(m => m.voice.channel).size;
        const text = guild.channels.cache.filter(c => c.type === ChannelType.GuildText).size;
        const vocal = guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice).size;
        const boosts = guild.premiumSubscriptionCount || 0;
        const level = guild.premiumTier;
        const created = `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`;
        
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`🏰 ${guild.name}`)
            .setThumbnail(guild.iconURL({ size: 1024 }))
            .addFields(
                { name: '👥 Members', value: `**${total}** total\n🟢 **${online}** online`, inline: true },
                { name: '🎧 Voice', value: `**${voice}** in voice\n🎤 **${vocal}** channels`, inline: true },
                { name: '📊 Channels', value: `💬 **${text}** text\n🔊 **${vocal}** voice`, inline: true },
                { name: `${level === 0 ? '⭐' : '💎'} Boost`, value: `Level **${level}**\n**${boosts}** boosts`, inline: true },
                { name: '📅 Created', value: `${created}`, inline: true }
            )
            .setFooter({ text: `ID: ${guild.id}` })
            .setTimestamp();
        await message.reply({ embeds: [embed] });
        return;
    }

    // FREE GAMES
    if (cmd === 'freegame') {
        if (activeFreeGameSessions.has(channel.id)) {
            return message.reply('❌ Already running! Use `!stopfreegame`');
        }
        await message.reply('🎮 Starting free games...');
        const game = await getRandomFreeGame();
        await sendFreeGameEmbed(channel, game);
        const interval = setInterval(async () => {
            const newGame = await getRandomFreeGame();
            await sendFreeGameEmbed(channel, newGame);
        }, 180000);
        activeFreeGameSessions.set(channel.id, interval);
        await sendLog(guild, 'FREE GAMES STARTED', 'Channel', member.user, `Started in #${channel.name}`);
        return;
    }
    
    if (cmd === 'stopfreegame') {
        const interval = activeFreeGameSessions.get(channel.id);
        if (interval) {
            clearInterval(interval);
            activeFreeGameSessions.delete(channel.id);
            message.reply('⏹️ Stopped.');
            await sendLog(guild, 'FREE GAMES STOPPED', 'Channel', member.user, `Stopped in #${channel.name}`);
        } else {
            message.reply('❌ No active session.');
        }
        return;
    }

    // STATS
    if (cmd === 'info') {
        let target = member.user;
        if (args[0]) { try { target = await client.users.fetch(args[0]); } catch(e) { return message.reply('❌ User not found'); } }
        await cmdInfo(message, target);
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
            .addFields({ name: 'XP', value: `${Math.floor(stats.xp)} / ${xpNeeded} XP`, inline: true })
            .setTimestamp();
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
            if (type === 'xp') desc += `${i+1}. **${name}** - Lvl ${top10[i].level} (${Math.floor(top10[i].xp)} XP)\n`;
            else if (type === 'messages') desc += `${i+1}. **${name}** - ${top10[i].messages.toLocaleString()} msgs\n`;
            else desc += `${i+1}. **${name}** - ${formatVoiceTime(top10[i].voice_minutes)}\n`;
        }
        const titles = { xp: 'XP', messages: 'Messages', voice: 'Voice' };
        const embed = new EmbedBuilder().setColor(0x5865F2).setTitle(`🏆 ${titles[type]} Leaderboard`).setDescription(desc || 'No data').setTimestamp();
        await message.reply({ embeds: [embed] });
        return;
    }
    if (cmd === 'messages') {
        let target = member.user;
        if (args[0]) { try { target = await client.users.fetch(args[0]); } catch(e) { return message.reply('❌ User not found'); } }
        const stats = await getUserStats(target.id);
        const embed = new EmbedBuilder().setColor(0x57F287).setTitle(`💬 ${target.tag}'s Messages`).setDescription(`**Total:** ${stats.messages.toLocaleString()}`).setTimestamp();
        await message.reply({ embeds: [embed] });
        return;
    }
    if (cmd === 'voice') {
        let target = member.user;
        if (args[0]) { try { target = await client.users.fetch(args[0]); } catch(e) { return message.reply('❌ User not found'); } }
        const stats = await getUserStats(target.id);
        const h = Math.floor(stats.voice_minutes / 60);
        const m = stats.voice_minutes % 60;
        const embed = new EmbedBuilder().setColor(0xEB459E).setTitle(`🎤 ${target.tag}'s Voice`).setDescription(`**Total:** ${h}h ${m}m`).setTimestamp();
        await message.reply({ embeds: [embed] });
        return;
    }

    // VERIFICATION
    if (cmd === 'verif') { await setupVerif(message); }
    else if (cmd === 'resetverif') { db.run(`DELETE FROM verification_config WHERE guild_id = ?`, [guild.id]); message.reply('✅ Reset'); }
    else if (cmd === 'sendpanel') { const cfg = await getVerif(guild.id); if (!cfg) return message.reply('❌ Not configured'); const ch = guild.channels.cache.get(cfg.channel); if (ch) await sendVerifPanel(ch); message.reply(`✅ Panel sent to ${ch}`); }
    else if (cmd === 'verifstatus') { const cfg = await getVerif(guild.id); if (!cfg) return message.reply('❌ Not configured'); const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('Verification Status').addFields({ name: 'Auto Role', value: `<@&${cfg.auto_role}>`, inline: true }, { name: 'Verified Role', value: `<@&${cfg.verified_role}>`, inline: true }, { name: 'Channel', value: `<#${cfg.channel}>`, inline: true }); message.reply({ embeds: [embed] }); }

    // TICKET
    else if (cmd === 'ticketsetup') { await setupTicket(message); }
    else if (cmd === 'ticket') { const cfg = await getTicketConfig(guild.id); if (!cfg) return message.reply('❌ Not configured'); const pc = guild.channels.cache.get(cfg.panel_channel); if (pc) await sendTicketPanel(pc, cfg); message.reply(`✅ Panel sent to ${pc}`); }

    // REACTION ROLES
    else if (cmd === 'roltest') { await setupRR(message); }

    // MODERATION
    else if (cmd === 'ban') {
        const id = args[0];
        if (!id) return message.reply('Usage: `!ban <id> [reason]`');
        const target = await getMember(guild, id);
        if (!target) return message.reply('❌ Not found');
        const reason = args.slice(1).join(' ') || 'No reason';
        await target.ban({ reason });
        await message.reply(`✅ Banned ${target.user.tag}`);
        await sendLog(guild, 'BAN', target.user, member.user, reason);
    }
    else if (cmd === 'kick') {
        const id = args[0];
        if (!id) return message.reply('Usage: `!kick <id> [reason]`');
        const target = await getMember(guild, id);
        if (!target) return message.reply('❌ Not found');
        const reason = args.slice(1).join(' ') || 'No reason';
        await target.kick(reason);
        await message.reply(`✅ Kicked ${target.user.tag}`);
        await sendLog(guild, 'KICK', target.user, member.user, reason);
    }
    else if (cmd === 'mute') {
        const id = args[0], time = args[1];
        if (!id || !time) return message.reply('Usage: `!mute <id> <time> [reason]`');
        const target = await getMember(guild, id);
        if (!target) return message.reply('❌ Not found');
        const ms = parseTime(time);
        if (!ms) return message.reply('❌ Invalid time');
        const reason = args.slice(2).join(' ') || 'No reason';
        await target.timeout(ms, reason);
        await message.reply(`✅ Muted ${target.user.tag} for ${fmtTime(ms)}`);
        await sendLog(guild, 'MUTE', target.user, member.user, reason);
    }
    else if (cmd === 'unmute') {
        const id = args[0];
        if (!id) return message.reply('Usage: `!unmute <id>`');
        const target = await getMember(guild, id);
        if (!target) return message.reply('❌ Not found');
        await target.timeout(null);
        await message.reply(`✅ Unmuted ${target.user.tag}`);
        await sendLog(guild, 'UNMUTE', target.user, member.user, 'No reason');
    }
    else if (cmd === 'warn') {
        const id = args[0];
        if (!id) return message.reply('Usage: `!warn <id> [reason]`');
        const target = await getMember(guild, id);
        if (!target) return message.reply('❌ Not found');
        const reason = args.slice(1).join(' ') || 'No reason';
        await addWarning(target.id, guild.id, reason, member.user.tag);
        const count = await getWarnCount(target.id, guild.id);
        await message.reply(`✅ Warned ${target.user.tag} (Total: ${count})`);
        await sendLog(guild, 'WARN', target.user, member.user, reason);
    }
    else if (cmd === 'clear') {
        const amount = parseInt(args[0]);
        if (!amount || amount < 1 || amount > 100) return message.reply('Usage: `!clear <1-100>`');
        try {
            const fetched = await channel.messages.fetch({ limit: amount });
            const deleted = await channel.bulkDelete(fetched);
            const reply = await message.reply(`✅ Deleted ${deleted.size} messages`);
            setTimeout(() => reply.delete(), 3000);
        } catch(e) { message.reply('❌ Failed'); }
    }
    else if (cmd === 'lock') { await channel.permissionOverwrites.edit(guild.id, { SendMessages: false }); message.reply('🔒 Locked'); }
    else if (cmd === 'unlock') { await channel.permissionOverwrites.edit(guild.id, { SendMessages: null }); message.reply('🔓 Unlocked'); }
    else if (cmd === 'giverole') {
        const uid = args[0], rid = args[1];
        if (!uid || !rid) return message.reply('Usage: `!giverole <id> <roleid>`');
        const target = await getMember(guild, uid);
        const role = guild.roles.cache.get(rid);
        if (!target || !role) return message.reply('❌ Not found');
        await target.roles.add(role);
        await message.reply(`✅ Added ${role.name} to ${target.user.tag}`);
    }
    else if (cmd === 'removerole') {
        const uid = args[0], rid = args[1];
        if (!uid || !rid) return message.reply('Usage: `!removerole <id> <roleid>`');
        const target = await getMember(guild, uid);
        const role = guild.roles.cache.get(rid);
        if (!target || !role) return message.reply('❌ Not found');
        await target.roles.remove(role);
        await message.reply(`✅ Removed ${role.name} from ${target.user.tag}`);
    }
    else if (cmd === 'unban') {
        const uid = args[0];
        if (!uid) return message.reply('Usage: `!unban <id>`');
        try {
            const user = await client.users.fetch(uid);
            await guild.members.unban(user);
            await message.reply(`✅ Unbanned ${user.tag}`);
        } catch(e) { message.reply('❌ Not found'); }
    }
    else if (cmd === 'userinfo') {
        const id = args[0];
        const target = id ? await getMember(guild, id) : member;
        if (!target) return message.reply('❌ Not found');
        const warns = await getWarnCount(target.id, guild.id);
        const embed = new EmbedBuilder().setColor(0x5865F2).setTitle(target.user.tag).setThumbnail(target.user.displayAvatarURL())
            .addFields({ name: 'ID', value: target.id, inline: true }, { name: 'Joined', value: `<t:${Math.floor(target.joinedTimestamp / 1000)}:R>`, inline: true }, { name: 'Warnings', value: `${warns}`, inline: true }).setTimestamp();
        await message.reply({ embeds: [embed] });
    }
    else if (cmd === 'avatar') {
        const id = args[0];
        const user = id ? await client.users.fetch(id) : message.author;
        const embed = new EmbedBuilder().setColor(0x5865F2).setTitle(`${user.tag}'s Avatar`).setImage(user.displayAvatarURL({ size: 1024 })).setTimestamp();
        await message.reply({ embeds: [embed] });
    }
    else if (cmd === 'ann') {
        const text = args.join(' ');
        if (!text) return message.reply('Usage: `!ann <message>`');
        await message.delete();
        await sendAnn(channel, text);
    }
    else if (cmd === 'anni') {
        await message.delete();
        await sendWelcome(channel);
    }
    else if (cmd === 'suggest') {
        const sug = args.join(' ');
        if (!sug) return message.reply('Usage: `!suggest <message>`');
        const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('💡 Suggestion').setDescription(sug).setAuthor({ name: member.user.tag }).setTimestamp();
        const msg = await channel.send({ embeds: [embed] });
        await msg.react('✅'); await msg.react('❌');
        db.run(`INSERT INTO suggestions (message_id, user_id, suggestion, date) VALUES (?, ?, ?, ?)`, [msg.id, member.user.id, sug, new Date().toISOString()]);
        await message.reply('✅ Submitted!');
    }
    else if (cmd === 'giveaway') {
        const prize = args[0], duration = parseInt(args[1]), winners = parseInt(args[2]);
        if (!prize || !duration || !winners) return message.reply('Usage: `!giveaway <prize> <minutes> <winners>`');
        const end = Date.now() + (duration * 60000);
        const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('🎉 GIVEAWAY').setDescription(`**Prize:** ${prize}\n**Winners:** ${winners}\n**Duration:** ${duration}m`).setFooter({ text: 'React 🎉' }).setTimestamp(end);
        const msg = await channel.send({ embeds: [embed] });
        await msg.react('🎉');
        db.run(`INSERT INTO giveaways (message_id, channel_id, prize, winners, end_time) VALUES (?, ?, ?, ?, ?)`, [msg.id, channel.id, prize, winners, end]);
        setTimeout(async () => {
            const fetched = await msg.fetch();
            const reaction = fetched.reactions.cache.get('🎉');
            let participants = reaction ? (await reaction.users.fetch()).filter(u => !u.bot) : [];
            const selected = [];
            for (let i = 0; i < Math.min(winners, participants.size); i++) {
                const idx = Math.floor(Math.random() * participants.size);
                selected.push([...participants][idx]);
            }
            const result = new EmbedBuilder().setColor(selected.length ? 0x22C55E : 0xEF4444).setTitle('🎉 GIVEAWAY ENDED')
                .setDescription(`**Prize:** ${prize}\n**Winners:** ${selected.length ? selected.map(w => w.toString()).join(', ') : 'None'}`).setTimestamp();
            await channel.send({ embeds: [result] });
        }, duration * 60000);
        await message.reply(`✅ Giveaway started for ${prize}!`);
    }
});

// ============================================
// READY
// ============================================
client.once('ready', async () => {
    await loadSentGames();
    console.log(`✅ ${client.user.tag} online!`);
    console.log(`📋 Prefix: !`);
    client.user.setActivity('!help', { type: 3 });
});

// ============================================
// SHUTDOWN
// ============================================
async function gracefulShutdown() {
    await saveAllVoiceTime();
    for (const interval of activeFreeGameSessions.values()) clearInterval(interval);
    db.close(() => process.exit(0));
}
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
process.on('unhandledRejection', (err) => console.error('Error:', err.message));

client.login(BOT_TOKEN);
