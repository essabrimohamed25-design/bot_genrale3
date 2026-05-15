const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const mongoose = require('mongoose');
const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { joinVoiceChannel, getVoiceConnection, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();

// ============================================
// CONFIGURATION
// ============================================
const PORT = process.env.PORT || 3000;
const PREFIX = process.env.PREFIX || '!';
const {
    BOT_TOKEN, CLIENT_ID, CLIENT_SECRET, SESSION_SECRET,
    MONGODB_URI, LOG_CHANNEL_ID, MOD_ROLE_ID, AUTO_ROLE_ID,
    VOICE_CHANNEL_ID, WELCOME_CHANNEL_ID
} = process.env;

// ============================================
// MONGODB SCHEMAS
// ============================================
const guildSettingsSchema = new mongoose.Schema({
    guildId: String,
    guildName: String,
    prefix: { type: String, default: '!' },
    antiLink: { type: Boolean, default: true },
    welcomeEnabled: { type: Boolean, default: true },
    welcomeChannel: String,
    welcomeMessage: String,
    autoRoleEnabled: { type: Boolean, default: false },
    autoRoleId: String,
    voiceAutoJoin: { type: Boolean, default: false },
    voiceChannelId: String,
    logChannelId: String,
    modRoleId: String,
    commands: { type: Map, default: new Map() }
});

const logSchema = new mongoose.Schema({
    guildId: String,
    action: String,
    userId: String,
    userName: String,
    moderatorId: String,
    moderatorName: String,
    reason: String,
    timestamp: { type: Date, default: Date.now }
});

const GuildSettings = mongoose.model('GuildSettings', guildSettingsSchema);
const Log = mongoose.model('Log', logSchema);

// ============================================
// SQLITE DATABASE (for existing data)
// ============================================
const sqliteDb = new sqlite3.Database('./bot_data.db');

sqliteDb.serialize(() => {
    sqliteDb.run(`CREATE TABLE IF NOT EXISTS warnings (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, guild_id TEXT, reason TEXT, moderator TEXT, date TEXT)`);
    sqliteDb.run(`CREATE TABLE IF NOT EXISTS suggestions (id INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT, user_id TEXT, suggestion TEXT, date TEXT)`);
    sqliteDb.run(`CREATE TABLE IF NOT EXISTS giveaways (id INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT, channel_id TEXT, prize TEXT, winners INTEGER, end_time INTEGER)`);
    sqliteDb.run(`CREATE TABLE IF NOT EXISTS tickets (user_id TEXT, channel_id TEXT, guild_id TEXT, created_at TEXT, PRIMARY KEY (user_id, guild_id))`);
    sqliteDb.run(`CREATE TABLE IF NOT EXISTS user_stats (user_id TEXT PRIMARY KEY, messages INTEGER DEFAULT 0, voice_minutes INTEGER DEFAULT 0, xp INTEGER DEFAULT 0, level INTEGER DEFAULT 1)`);
    sqliteDb.run(`CREATE TABLE IF NOT EXISTS free_games_sent (id INTEGER PRIMARY KEY AUTOINCREMENT, game_id TEXT UNIQUE, sent_at TEXT)`);
    console.log('✅ SQLite database ready');
});

// ============================================
// DISCORD BOT SETUP
// ============================================
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

// Storage
const voiceStartTimes = new Map();
const activeFreeGameSessions = new Map();
const sentGamesCache = new Set();
const linkWarnCooldown = new Map();

// Free games list
const FREE_STEAM_GAMES = [
    { id: 730, title: "Counter-Strike 2", desc: "Free-to-play competitive FPS.", image: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/730/header.jpg", url: "https://store.steampowered.com/app/730/CounterStrike_2/" },
    { id: 570, title: "Dota 2", desc: "Popular MOBA game.", image: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/570/header.jpg", url: "https://store.steampowered.com/app/570/Dota_2/" },
    { id: 440, title: "Team Fortress 2", desc: "Class-based team shooter.", image: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/440/header.jpg", url: "https://store.steampowered.com/app/440/Team_Fortress_2/" },
    { id: 1172470, title: "Apex Legends", desc: "Battle royale shooter.", image: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1172470/header.jpg", url: "https://store.steampowered.com/app/1172470/Apex_Legends/" }
];

// Helper functions
function isMod(member) {
    if (!member) return false;
    if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
    if (MOD_ROLE_ID && member.roles.cache.has(MOD_ROLE_ID)) return true;
    return false;
}

async function sendLog(guild, action, target, mod, reason) {
    const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel) return;
    
    const embed = new EmbedBuilder()
        .setColor(0x2b2d31)
        .setTitle(`📋 ${action}`)
        .addFields(
            { name: 'Mod', value: mod?.tag || 'System', inline: true },
            { name: 'Target', value: target?.tag || target || 'Unknown', inline: true },
            { name: 'Reason', value: reason || 'None', inline: false }
        )
        .setTimestamp();
    
    await logChannel.send({ embeds: [embed] });
    
    // Save to MongoDB logs
    try {
        await Log.create({
            guildId: guild.id,
            action: action,
            userId: target?.id,
            userName: target?.tag,
            moderatorId: mod?.id,
            moderatorName: mod?.tag,
            reason: reason
        });
    } catch (err) {}
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

// Load sent games
async function loadSentGames() {
    return new Promise((resolve) => {
        sqliteDb.all(`SELECT game_id FROM free_games_sent`, [], (err, rows) => {
            if (rows) rows.forEach(row => sentGamesCache.add(String(row.game_id)));
            console.log(`📚 Loaded ${sentGamesCache.size} sent games`);
            resolve();
        });
    });
}

// ============================================
// ANTI-LINK SYSTEM
// ============================================
const LINK_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+|discord\.gg\/[^\s]+|discord\.com\/invite\/[^\s]+)/i;

client.on('messageCreate', async (message) => {
    if (message.author?.bot || !message.guild || message.webhookId) return;
    if (message.content.startsWith(PREFIX)) return;
    if (isMod(message.member)) return;
    
    // Check guild settings for anti-link
    const settings = await GuildSettings.findOne({ guildId: message.guild.id });
    if (settings && settings.antiLink === false) return;
    
    if (LINK_REGEX.test(message.content)) {
        try {
            await message.delete();
            
            const now = Date.now();
            const lastWarn = linkWarnCooldown.get(message.author.id);
            
            if (!lastWarn || now - lastWarn > 10000) {
                linkWarnCooldown.set(message.author.id, now);
                setTimeout(() => linkWarnCooldown.delete(message.author.id), 10000);
                
                const warnMsg = await message.channel.send(`${message.author} No links allowed!`);
                setTimeout(() => warnMsg.delete().catch(() => {}), 3000);
            }
            
            await message.member.timeout(60000, `Sent a link`);
            
            if (LOG_CHANNEL_ID) {
                const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);
                if (logChannel) {
                    const embed = new EmbedBuilder()
                        .setColor(0xFF0000)
                        .setTitle('🔗 Anti-Link Violation')
                        .addFields(
                            { name: 'User', value: message.author.tag, inline: true },
                            { name: 'Action', value: 'Timeout (1 minute)', inline: true }
                        )
                        .setTimestamp();
                    await logChannel.send({ embeds: [embed] });
                }
            }
        } catch (err) {}
    }
});

// ============================================
// WELCOME SYSTEM
// ============================================
client.on('guildMemberAdd', async (member) => {
    const settings = await GuildSettings.findOne({ guildId: member.guild.id });
    
    if (settings && settings.welcomeEnabled !== false) {
        const channelId = settings.welcomeChannel || WELCOME_CHANNEL_ID;
        const channel = member.guild.channels.cache.get(channelId);
        
        if (channel) {
            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle(`🎉 WELCOME TO ${member.guild.name.toUpperCase()} 🎉`)
                .setDescription(settings.welcomeMessage || `Hey ${member.toString()}! Welcome to the community! ✨`)
                .setThumbnail(member.user.displayAvatarURL({ size: 1024 }))
                .setTimestamp();
            
            await channel.send({ content: `${member.toString()}`, embeds: [embed] });
        }
    }
    
    // Auto role
    const autoRoleEnabled = settings?.autoRoleEnabled || false;
    const autoRoleId = settings?.autoRoleId || AUTO_ROLE_ID;
    
    if ((autoRoleEnabled || AUTO_ROLE_ID) && autoRoleId) {
        try {
            await member.roles.add(autoRoleId);
        } catch (err) {}
    }
});

// ============================================
// VOICE AUTO-JOIN
// ============================================
async function joinVoiceChannelProper() {
    const voiceChannelId = VOICE_CHANNEL_ID;
    if (!voiceChannelId) return;
    
    try {
        const guild = client.guilds.cache.first();
        if (!guild) return;
        
        const voiceChannel = guild.channels.cache.get(voiceChannelId);
        if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice) return;
        
        const connection = joinVoiceChannel({
            channelId: voiceChannelId,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: false
        });
        
        console.log(`🎤 Joined voice channel: ${voiceChannel.name}`);
    } catch (error) {
        console.error(`❌ Failed to join voice channel: ${error.message}`);
    }
}

// ============================================
// COMMAND HANDLER
// ============================================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;
    
    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();
    const { member, guild, channel } = message;
    
    // HELP
    if (cmd === 'help') {
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('🛡️ Bot Commands')
            .setDescription(`
                **Moderation:** \`!ban\`, \`!kick\`, \`!mute\`, \`!unmute\`, \`!warn\`, \`!clear\`, \`!lock\`, \`!unlock\`
                **Info:** \`!userinfo\`, \`!serverinfo\`, \`!avatar\`
                **Stats:** \`!rank\`, \`!top\`
                **Fun:** \`!freegame\`, \`!stopfreegame\`
                **Suggest:** \`!suggest <message>\`
                **Giveaway:** \`!giveaway <prize> <minutes> <winners>\`
            `)
            .setTimestamp();
        return message.reply({ embeds: [embed] });
    }
    
    // SERVER INFO
    if (cmd === 'serverinfo') {
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(guild.name)
            .setThumbnail(guild.iconURL())
            .addFields(
                { name: '👥 Members', value: `${guild.memberCount}`, inline: true },
                { name: '📅 Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true },
                { name: '👑 Owner', value: `<@${guild.ownerId}>`, inline: true }
            )
            .setTimestamp();
        return message.reply({ embeds: [embed] });
    }
    
    // USER INFO
    if (cmd === 'userinfo') {
        const target = args[0] ? await message.guild.members.fetch(args[0]).catch(() => null) : member;
        if (!target) return message.reply('❌ User not found');
        
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(target.user.tag)
            .setThumbnail(target.user.displayAvatarURL())
            .addFields(
                { name: 'ID', value: target.id, inline: true },
                { name: 'Joined', value: `<t:${Math.floor(target.joinedTimestamp / 1000)}:R>`, inline: true },
                { name: 'Roles', value: `${target.roles.cache.size}`, inline: true }
            )
            .setTimestamp();
        return message.reply({ embeds: [embed] });
    }
    
    // FREE GAMES
    if (cmd === 'freegame') {
        if (activeFreeGameSessions.has(channel.id)) {
            return message.reply('❌ Already running! Use `!stopfreegame`');
        }
        
        await message.reply('🎮 Starting free games every 3 minutes...');
        
        const game = FREE_STEAM_GAMES[Math.floor(Math.random() * FREE_STEAM_GAMES.length)];
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle(`🎮 ${game.title}`)
            .setURL(game.url)
            .setDescription(game.desc)
            .setImage(game.image)
            .addFields({ name: '💰 Price', value: '**FREE!**', inline: true })
            .setTimestamp();
        await channel.send({ embeds: [embed] });
        
        const interval = setInterval(async () => {
            const newGame = FREE_STEAM_GAMES[Math.floor(Math.random() * FREE_STEAM_GAMES.length)];
            const newEmbed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle(`🎮 ${newGame.title}`)
                .setURL(newGame.url)
                .setDescription(newGame.desc)
                .setImage(newGame.image)
                .addFields({ name: '💰 Price', value: '**FREE!**', inline: true })
                .setTimestamp();
            await channel.send({ embeds: [newEmbed] });
        }, 180000);
        
        activeFreeGameSessions.set(channel.id, interval);
        return;
    }
    
    if (cmd === 'stopfreegame') {
        const interval = activeFreeGameSessions.get(channel.id);
        if (interval) {
            clearInterval(interval);
            activeFreeGameSessions.delete(channel.id);
            message.reply('⏹️ Stopped free games.');
        } else {
            message.reply('❌ No active free game session.');
        }
        return;
    }
    
    // SUGGEST
    if (cmd === 'suggest') {
        const suggestion = args.join(' ');
        if (!suggestion) return message.reply('Usage: `!suggest <your suggestion>`');
        
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('💡 Suggestion')
            .setDescription(suggestion)
            .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
            .setTimestamp();
        
        const msg = await channel.send({ embeds: [embed] });
        await msg.react('✅');
        await msg.react('❌');
        await message.reply('✅ Suggestion submitted!');
        return;
    }
    
    // GIVEAWAY
    if (cmd === 'giveaway') {
        if (!isMod(member)) return message.reply('❌ No permission!');
        
        const prize = args[0];
        const duration = parseInt(args[1]);
        const winners = parseInt(args[2]);
        
        if (!prize || !duration || !winners) {
            return message.reply('Usage: `!giveaway <prize> <minutes> <winners>`');
        }
        
        const endTime = Date.now() + (duration * 60000);
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('🎉 GIVEAWAY 🎉')
            .setDescription(`**Prize:** ${prize}\n**Winners:** ${winners}\n**Ends:** <t:${Math.floor(endTime / 1000)}:R>`)
            .setFooter({ text: 'React with 🎉 to enter!' })
            .setTimestamp(endTime);
        
        const msg = await channel.send({ embeds: [embed] });
        await msg.react('🎉');
        
        setTimeout(async () => {
            const fetched = await msg.fetch();
            const reaction = fetched.reactions.cache.get('🎉');
            const users = await reaction.users.fetch();
            const participants = users.filter(u => !u.bot);
            const winnerList = [];
            
            for (let i = 0; i < Math.min(winners, participants.size); i++) {
                const winner = participants.random();
                winnerList.push(winner.toString());
                participants.delete(winner.id);
            }
            
            const resultEmbed = new EmbedBuilder()
                .setColor(winnerList.length ? 0x22C55E : 0xEF4444)
                .setTitle('🎉 GIVEAWAY ENDED 🎉')
                .setDescription(`**Prize:** ${prize}\n**Winners:** ${winnerList.length ? winnerList.join(', ') : 'No valid entries'}`)
                .setTimestamp();
            
            await channel.send({ embeds: [resultEmbed] });
        }, duration * 60000);
        
        await message.reply(`✅ Giveaway started for **${prize}**!`);
        return;
    }
    
    // MODERATION COMMANDS (only if mod)
    const modCmds = ['ban', 'kick', 'mute', 'unmute', 'warn', 'clear', 'lock', 'unlock'];
    if (modCmds.includes(cmd) && !isMod(member)) {
        return message.reply('❌ You need moderator permissions!');
    }
    
    // BAN
    if (cmd === 'ban') {
        const targetId = args[0];
        if (!targetId) return message.reply('Usage: `!ban <user_id> [reason]`');
        
        const target = await message.guild.members.fetch(targetId).catch(() => null);
        if (!target) return message.reply('❌ User not found');
        
        const reason = args.slice(1).join(' ') || 'No reason';
        await target.ban({ reason });
        await message.reply(`✅ Banned ${target.user.tag}`);
        await sendLog(guild, 'BAN', target.user, member.user, reason);
        return;
    }
    
    // KICK
    if (cmd === 'kick') {
        const targetId = args[0];
        if (!targetId) return message.reply('Usage: `!kick <user_id> [reason]`');
        
        const target = await message.guild.members.fetch(targetId).catch(() => null);
        if (!target) return message.reply('❌ User not found');
        
        const reason = args.slice(1).join(' ') || 'No reason';
        await target.kick(reason);
        await message.reply(`✅ Kicked ${target.user.tag}`);
        await sendLog(guild, 'KICK', target.user, member.user, reason);
        return;
    }
    
    // MUTE
    if (cmd === 'mute') {
        const targetId = args[0];
        const time = args[1];
        if (!targetId || !time) return message.reply('Usage: `!mute <user_id> <time> [reason]`');
        
        const target = await message.guild.members.fetch(targetId).catch(() => null);
        if (!target) return message.reply('❌ User not found');
        
        const ms = parseTime(time);
        if (!ms) return message.reply('❌ Invalid time format. Use: 10s, 5m, 2h, 1d');
        
        const reason = args.slice(2).join(' ') || 'No reason';
        await target.timeout(ms, reason);
        await message.reply(`✅ Muted ${target.user.tag} for ${time}`);
        await sendLog(guild, 'MUTE', target.user, member.user, reason);
        return;
    }
    
    // UNMUTE
    if (cmd === 'unmute') {
        const targetId = args[0];
        if (!targetId) return message.reply('Usage: `!unmute <user_id>`');
        
        const target = await message.guild.members.fetch(targetId).catch(() => null);
        if (!target) return message.reply('❌ User not found');
        
        await target.timeout(null);
        await message.reply(`✅ Unmuted ${target.user.tag}`);
        await sendLog(guild, 'UNMUTE', target.user, member.user, 'No reason');
        return;
    }
    
    // CLEAR
    if (cmd === 'clear') {
        const amount = parseInt(args[0]);
        if (!amount || amount < 1 || amount > 100) {
            return message.reply('Usage: `!clear <1-100>`');
        }
        
        const deleted = await channel.bulkDelete(amount);
        const reply = await message.reply(`✅ Deleted ${deleted.size} messages`);
        setTimeout(() => reply.delete(), 3000);
        return;
    }
    
    // LOCK
    if (cmd === 'lock') {
        await channel.permissionOverwrites.edit(guild.id, { SendMessages: false });
        await message.reply('🔒 Channel locked');
        return;
    }
    
    // UNLOCK
    if (cmd === 'unlock') {
        await channel.permissionOverwrites.edit(guild.id, { SendMessages: null });
        await message.reply('🔓 Channel unlocked');
        return;
    }
});

// ============================================
// EXPRESS DASHBOARD
// ============================================
const app = express();

// Middleware
app.set('view engine', 'ejs');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Session
app.use(session({
    secret: SESSION_SECRET || 'secret-key-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 7 * 24 * 60 * 60 * 1000 } // 7 days
}));

// Passport
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(new DiscordStrategy({
    clientID: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    callbackURL: `${process.env.DASHBOARD_URL || 'http://localhost:3000'}/auth/discord/callback`,
    scope: ['identify', 'guilds']
}, (accessToken, refreshToken, profile, done) => {
    process.nextTick(() => done(null, profile));
}));

// Auth middleware
function checkAuth(req, res, next) {
    if (req.isAuthenticated()) return next();
    res.redirect('/login');
}

// Routes
app.get('/', (req, res) => {
    res.render('index', { user: req.user });
});

app.get('/login', (req, res) => {
    res.render('login', { user: req.user });
});

app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord', {
    failureRedirect: '/',
    successRedirect: '/dashboard'
}));

app.get('/logout', (req, res) => {
    req.logout(() => {
        res.redirect('/');
    });
});

app.get('/dashboard', checkAuth, async (req, res) => {
    const guilds = req.user.guilds;
    const botGuilds = client.guilds.cache.map(g => ({ id: g.id, name: g.name, icon: g.iconURL() }));
    const mutualGuilds = guilds.filter(g => botGuilds.some(bg => bg.id === g.id));
    
    res.render('dashboard', { user: req.user, guilds: mutualGuilds });
});

app.get('/dashboard/:guildId', checkAuth, async (req, res) => {
    const guildId = req.params.guildId;
    const guild = client.guilds.cache.get(guildId);
    
    if (!guild) return res.redirect('/dashboard');
    
    let settings = await GuildSettings.findOne({ guildId });
    if (!settings) {
        settings = new GuildSettings({ guildId, guildName: guild.name });
        await settings.save();
    }
    
    res.render('guild', { user: req.user, guild, settings });
});

app.post('/api/guild/:guildId/settings', checkAuth, async (req, res) => {
    const { guildId } = req.params;
    const { prefix, antiLink, welcomeEnabled, welcomeChannel, welcomeMessage, autoRoleEnabled, autoRoleId, voiceAutoJoin, voiceChannelId, logChannelId, modRoleId } = req.body;
    
    await GuildSettings.findOneAndUpdate(
        { guildId },
        {
            prefix: prefix || '!',
            antiLink: antiLink === 'on',
            welcomeEnabled: welcomeEnabled === 'on',
            welcomeChannel,
            welcomeMessage,
            autoRoleEnabled: autoRoleEnabled === 'on',
            autoRoleId,
            voiceAutoJoin: voiceAutoJoin === 'on',
            voiceChannelId,
            logChannelId,
            modRoleId
        },
        { upsert: true }
    );
    
    res.json({ success: true });
});

app.get('/api/guild/:guildId/logs', checkAuth, async (req, res) => {
    const logs = await Log.find({ guildId: req.params.guildId }).sort({ timestamp: -1 }).limit(100);
    res.json(logs);
});

// Simple EJS template as string (inline)
const ejsTemplates = {
    layout: `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bot Dashboard</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1e1f22; color: #dbdee1; line-height: 1.6; }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        nav { background: #2b2d31; padding: 15px 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #1e1f22; }
        .logo { font-size: 20px; font-weight: bold; color: #5865f2; }
        .btn { display: inline-block; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 500; transition: all 0.2s; cursor: pointer; border: none; }
        .btn-primary { background: #5865f2; color: white; }
        .btn-primary:hover { background: #4752c4; }
        .btn-danger { background: #ed4245; color: white; }
        .btn-danger:hover { background: #c03537; }
        .btn-secondary { background: #4e5058; color: white; }
        .card { background: #2b2d31; border-radius: 12px; padding: 20px; margin-bottom: 20px; border: 1px solid #1e1f22; }
        .guild-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 20px; margin-top: 20px; }
        .guild-card { background: #2b2d31; border-radius: 12px; padding: 20px; text-align: center; border: 1px solid #1e1f22; transition: transform 0.2s; }
        .guild-card:hover { transform: translateY(-2px); border-color: #5865f2; }
        .guild-icon { width: 80px; height: 80px; border-radius: 50%; margin-bottom: 15px; object-fit: cover; }
        .guild-name { font-size: 18px; font-weight: bold; margin-bottom: 10px; }
        input, select, textarea { background: #1e1f22; border: 1px solid #3b3f48; border-radius: 8px; padding: 10px; color: #dbdee1; width: 100%; margin-bottom: 15px; }
        label { display: block; margin-bottom: 5px; font-weight: 500; color: #b5bac1; }
        .form-group { margin-bottom: 20px; }
        .checkbox-group { display: flex; align-items: center; gap: 10px; margin-bottom: 15px; }
        .checkbox-group input { width: auto; margin-bottom: 0; }
        .alert { padding: 12px 20px; border-radius: 8px; margin-bottom: 20px; }
        .alert-success { background: #1a5d1a; color: #7ee07e; }
        .alert-error { background: #5d1a1a; color: #e07e7e; }
        .log-entry { border-bottom: 1px solid #3b3f48; padding: 12px 0; }
        .log-time { color: #80848e; font-size: 12px; }
        .flex { display: flex; justify-content: space-between; align-items: center; }
        h1, h2, h3 { margin-bottom: 20px; }
        @media (max-width: 768px) { .guild-list { grid-template-columns: 1fr; } }
    </style>
</head>
<body>
    <nav>
        <div class="logo">🎮 Bot Dashboard</div>
        <div>
            <% if (user) { %>
                <span style="margin-right: 15px;"><%= user.username %></span>
                <a href="/dashboard" class="btn btn-secondary" style="margin-right: 10px;">Dashboard</a>
                <a href="/logout" class="btn btn-danger">Logout</a>
            <% } else { %>
                <a href="/login" class="btn btn-primary">Login with Discord</a>
            <% } %>
        </div>
    </nav>
    <div class="container">
        <%- body %>
    </div>
</body>
</html>
    `,
    
    index: `
<div class="card" style="text-align: center; padding: 60px 20px;">
    <h1>🎮 Discord Moderation Bot</h1>
    <p style="font-size: 18px; margin: 20px 0;">Complete moderation solution with web dashboard</p>
    <div style="margin-top: 30px;">
        <div style="display: flex; gap: 20px; justify-content: center; flex-wrap: wrap;">
            <div style="background: #2b2d31; padding: 20px; border-radius: 12px; width: 200px;">
                <h3>🛡️ Moderation</h3>
                <p>Ban, kick, mute, warn</p>
            </div>
            <div style="background: #2b2d31; padding: 20px; border-radius: 12px; width: 200px;">
                <h3>📊 Stats</h3>
                <p>User activity tracking</p>
            </div>
            <div style="background: #2b2d31; padding: 20px; border-radius: 12px; width: 200px;">
                <h3>🎮 Free Games</h3>
                <p>Auto game announcements</p>
            </div>
            <div style="background: #2b2d31; padding: 20px; border-radius: 12px; width: 200px;">
                <h3>🔗 Anti-Link</h3>
                <p>Automatic link blocking</p>
            </div>
        </div>
    </div>
    <% if (!user) { %>
        <a href="/login" class="btn btn-primary" style="margin-top: 40px;">Get Started →</a>
    <% } %>
</div>
    `,
    
    login: `
<div class="card" style="text-align: center; max-width: 400px; margin: 50px auto;">
    <h1>🔐 Login Required</h1>
    <p style="margin: 20px 0;">Login with Discord to access the dashboard and manage your server settings.</p>
    <a href="/auth/discord" class="btn btn-primary" style="padding: 12px 30px;">Login with Discord</a>
</div>
    `,
    
    dashboard: `
<h1>Your Servers</h1>
<div class="guild-list">
    <% guilds.forEach(guild => { %>
        <a href="/dashboard/<%= guild.id %>" style="text-decoration: none; color: inherit;">
            <div class="guild-card">
                <img src="<%= guild.icon ? 'https://cdn.discordapp.com/icons/' + guild.id + '/' + guild.icon + '.png' : 'https://cdn.discordapp.com/embed/avatars/0.png' %>" class="guild-icon">
                <div class="guild-name"><%= guild.name %></div>
                <span class="btn btn-secondary" style="font-size: 14px; margin-top: 10px;">Manage →</span>
            </div>
        </a>
    <% }) %>
    <% if (guilds.length === 0) { %>
        <p>No servers found. Make sure the bot is added to your servers!</p>
    <% } %>
</div>
    `,
    
    guild: `
<div class="flex">
    <h1><%= guild.name %></h1>
    <a href="/dashboard" class="btn btn-secondary">← Back</a>
</div>

<div id="alert" style="display: none;" class="alert alert-success"></div>

<form id="settingsForm">
    <div class="card">
        <h2>⚙️ General Settings</h2>
        <div class="form-group">
            <label>Bot Prefix</label>
            <input type="text" name="prefix" value="<%= settings.prefix %>" placeholder="!">
        </div>
    </div>
    
    <div class="card">
        <h2>🛡️ Moderation</h2>
        <div class="checkbox-group">
            <input type="checkbox" name="antiLink" id="antiLink" <%= settings.antiLink ? 'checked' : '' %>>
            <label for="antiLink">Enable Anti-Link (auto timeout for links)</label>
        </div>
        <div class="form-group">
            <label>Mod Role ID</label>
            <input type="text" name="modRoleId" value="<%= settings.modRoleId || '' %>" placeholder="Role ID for moderators">
        </div>
        <div class="form-group">
            <label>Log Channel ID</label>
            <input type="text" name="logChannelId" value="<%= settings.logChannelId || '' %>" placeholder="Channel ID for logs">
        </div>
    </div>
    
    <div class="card">
        <h2>👋 Welcome System</h2>
        <div class="checkbox-group">
            <input type="checkbox" name="welcomeEnabled" id="welcomeEnabled" <%= settings.welcomeEnabled !== false ? 'checked' : '' %>>
            <label for="welcomeEnabled">Enable Welcome Messages</label>
        </div>
        <div class="form-group">
            <label>Welcome Channel ID</label>
            <input type="text" name="welcomeChannel" value="<%= settings.welcomeChannel || '' %>" placeholder="Channel ID for welcome messages">
        </div>
        <div class="form-group">
            <label>Welcome Message</label>
            <textarea name="welcomeMessage" rows="3" placeholder="Welcome {user} to {server}!">{user} Welcome to {server}!</textarea>
        </div>
    </div>
    
    <div class="card">
        <h2>🎭 Auto Role</h2>
        <div class="checkbox-group">
            <input type="checkbox" name="autoRoleEnabled" id="autoRoleEnabled" <%= settings.autoRoleEnabled ? 'checked' : '' %>>
            <label for="autoRoleEnabled">Enable Auto Role on Join</label>
        </div>
        <div class="form-group">
            <label>Auto Role ID</label>
            <input type="text" name="autoRoleId" value="<%= settings.autoRoleId || '' %>" placeholder="Role ID to assign on join">
        </div>
    </div>
    
    <div class="card">
        <h2>🎤 Voice Settings</h2>
        <div class="checkbox-group">
            <input type="checkbox" name="voiceAutoJoin" id="voiceAutoJoin" <%= settings.voiceAutoJoin ? 'checked' : '' %>>
            <label for="voiceAutoJoin">Auto-Join Voice Channel</label>
        </div>
        <div class="form-group">
            <label>Voice Channel ID</label>
            <input type="text" name="voiceChannelId" value="<%= settings.voiceChannelId || '' %>" placeholder="Voice channel ID to auto-join">
        </div>
    </div>
    
    <div class="card">
        <h2>📋 Server Logs</h2>
        <div id="logsContainer">
            <p>Loading logs...</p>
        </div>
    </div>
    
    <button type="submit" class="btn btn-primary">Save Settings</button>
</form>

<script>
    // Load logs
    async function loadLogs() {
        const res = await fetch('/api/guild/<%= guild.id %>/logs');
        const logs = await res.json();
        const container = document.getElementById('logsContainer');
        if (logs.length === 0) {
            container.innerHTML = '<p>No logs yet.</p>';
            return;
        }
        container.innerHTML = logs.map(log => \`
            <div class="log-entry">
                <div class="flex">
                    <strong>\${log.action}</strong>
                    <span class="log-time">\${new Date(log.timestamp).toLocaleString()}</span>
                </div>
                <div>User: \${log.userName || 'Unknown'}</div>
                <div>Mod: \${log.moderatorName || 'System'}</div>
                <div>Reason: \${log.reason || 'None'}</div>
            </div>
        \`).join('');
    }
    
    loadLogs();
    
    // Save settings
    document.getElementById('settingsForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());
        
        const res = await fetch('/api/guild/<%= guild.id %>/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        if (res.ok) {
            const alert = document.getElementById('alert');
            alert.textContent = '✅ Settings saved successfully!';
            alert.style.display = 'block';
            setTimeout(() => alert.style.display = 'none', 3000);
        }
    });
</script>
    `
};

// Set up EJS
app.engine('ejs', (filePath, data, callback) => {
    const templateName = filePath.split('/').pop().replace('.ejs', '');
    let template = ejsTemplates[templateName];
    
    if (!template && templateName === 'layout') {
        template = ejsTemplates.layout;
    }
    
    if (templateName === 'index' || templateName === 'login' || templateName === 'dashboard' || templateName === 'guild') {
        const layout = ejsTemplates.layout;
        const body = ejsTemplates[templateName];
        const fullHtml = layout.replace('<%- body %>', body);
        
        let rendered = fullHtml;
        if (data.user) {
            rendered = rendered.replace(/<% if \(user\) { %>([\s\S]*?)<% } else { %>([\s\S]*?)<% } %>/g, (match, ifTrue, ifFalse) => {
                return data.user ? ifTrue : ifFalse;
            });
            rendered = rendered.replace(/<%= user\.username %>/g, data.user.username);
        } else {
            rendered = rendered.replace(/<% if \(user\) { %>[\s\S]*?<% } else { %>([\s\S]*?)<% } %>/g, '$1');
            rendered = rendered.replace(/<%= user\.username %>/g, '');
        }
        
        rendered = rendered.replace(/<% guilds\.forEach\(guild => { %>([\s\S]*?)<% }\) %>/g, () => {
            if (!data.guilds) return '';
            return data.guilds.map(guild => {
                return `<a href="/dashboard/${guild.id}" style="text-decoration: none; color: inherit;">
                    <div class="guild-card">
                        <img src="${guild.icon ? 'https://cdn.discordapp.com/icons/' + guild.id + '/' + guild.icon + '.png' : 'https://cdn.discordapp.com/embed/avatars/0.png'}" class="guild-icon">
                        <div class="guild-name">${guild.name}</div>
                        <span class="btn btn-secondary" style="font-size: 14px; margin-top: 10px;">Manage →</span>
                    </div>
                </a>`;
            }).join('');
        });
        
        rendered = rendered.replace(/<%= guild\.name %>/g, data.guild?.name || '');
        rendered = rendered.replace(/<%= guild\.id %>/g, data.guild?.id || '');
        rendered = rendered.replace(/<%= settings\.prefix %>/g, data.settings?.prefix || '!');
        rendered = rendered.replace(/<%= settings\.antiLink \? 'checked' : '' %>/g, data.settings?.antiLink ? 'checked' : '');
        rendered = rendered.replace(/<%= settings\.modRoleId \|\| '' %>/g, data.settings?.modRoleId || '');
        rendered = rendered.replace(/<%= settings\.logChannelId \|\| '' %>/g, data.settings?.logChannelId || '');
        rendered = rendered.replace(/<%= settings\.welcomeEnabled !== false \? 'checked' : '' %>/g, data.settings?.welcomeEnabled !== false ? 'checked' : '');
        rendered = rendered.replace(/<%= settings\.welcomeChannel \|\| '' %>/g, data.settings?.welcomeChannel || '');
        rendered = rendered.replace(/<%= settings\.autoRoleEnabled \? 'checked' : '' %>/g, data.settings?.autoRoleEnabled ? 'checked' : '');
        rendered = rendered.replace(/<%= settings\.autoRoleId \|\| '' %>/g, data.settings?.autoRoleId || '');
        rendered = rendered.replace(/<%= settings\.voiceAutoJoin \? 'checked' : '' %>/g, data.settings?.voiceAutoJoin ? 'checked' : '');
        rendered = rendered.replace(/<%= settings\.voiceChannelId \|\| '' %>/g, data.settings?.voiceChannelId || '');
        rendered = rendered.replace(/<%= settings\.welcomeMessage \|\| '' %>/g, data.settings?.welcomeMessage || '{user} Welcome to {server}!');
        
        callback(null, rendered);
    } else {
        callback(null, ejsTemplates[templateName] || '');
    }
});
app.set('views', __dirname);

// ============================================
// START SERVER AND BOT
// ============================================
async function start() {
    // Connect to MongoDB
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ MongoDB connected');
    } catch (err) {
        console.error('❌ MongoDB connection error:', err);
        process.exit(1);
    }
    
    // Load data
    await loadSentGames();
    
    // Start Express server
    app.listen(PORT, () => {
        console.log(`🌐 Dashboard running at http://localhost:${PORT}`);
    });
    
    // Login Discord bot
    await client.login(BOT_TOKEN);
    console.log(`✅ Bot ${client.user.tag} online!`);
    
    // Join voice channel
    setTimeout(() => joinVoiceChannelProper(), 5000);
}

start().catch(console.error);

// Graceful shutdown
process.on('SIGINT', async () => {
    for (const interval of activeFreeGameSessions.values()) clearInterval(interval);
    sqliteDb.close();
    await mongoose.disconnect();
    process.exit(0);
});
