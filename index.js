const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();

// ============================================
// DATABASE
// ============================================
const db = new sqlite3.Database('./data.db');

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS warns (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, guild_id TEXT, reason TEXT, moderator TEXT, date TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS tickets (user_id TEXT, channel_id TEXT, guild_id TEXT, PRIMARY KEY (user_id, guild_id))`);
    db.run(`CREATE TABLE IF NOT EXISTS ticket_config (guild_id TEXT PRIMARY KEY, category TEXT, log_channel TEXT, support_role TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS reaction_roles (guild_id TEXT, message_id TEXT, channel_id TEXT, emoji TEXT, role_id TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS verification (guild_id TEXT PRIMARY KEY, auto_role TEXT, verified_role TEXT, channel TEXT, image_url TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS stats (user_id TEXT PRIMARY KEY, messages INTEGER DEFAULT 0, voice INTEGER DEFAULT 0)`);
    console.log('✅ Database prête');
});

// ============================================
// CONFIG
// ============================================
const { BOT_TOKEN, LOG_CHANNEL_ID, MOD_ROLE_ID, AUTO_ROLE_ID, WELCOME_CHANNEL_ID } = process.env;
if (!BOT_TOKEN) { console.error('❌ Token manquant'); process.exit(1); }

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// ============================================
// HELPER FUNCTIONS
// ============================================
function isMod(member) {
    if (!member) return false;
    if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
    if (MOD_ROLE_ID && member.roles.cache.has(MOD_ROLE_ID)) return true;
    return false;
}

async function sendLog(guild, action, target, moderator, reason) {
    const ch = guild.channels.cache.get(LOG_CHANNEL_ID);
    if (!ch) return;
    const embed = new EmbedBuilder().setColor(0x2b2d31).setTitle(`📋 ${action}`)
        .addFields(
            { name: 'Modérateur', value: moderator?.tag || 'Système', inline: true },
            { name: 'Cible', value: target?.tag || target || 'Inconnu', inline: true },
            { name: 'Raison', value: reason || 'Aucune', inline: false }
        ).setTimestamp();
    await ch.send({ embeds: [embed] });
}

async function getMember(guild, id) {
    try { return await guild.members.fetch(id); } catch { return null; }
}

function parseTime(t) {
    const m = t.match(/^(\d+)([smhd])$/);
    if (!m) return null;
    const v = parseInt(m[1]);
    if (m[2] === 's') return v * 1000;
    if (m[2] === 'm') return v * 60000;
    if (m[2] === 'h') return v * 3600000;
    if (m[2] === 'd') return v * 86400000;
    return null;
}

function formatTime(ms) {
    const m = Math.floor(ms / 60000);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (d > 0) return `${d} jour(s)`;
    if (h > 0) return `${h} heure(s)`;
    if (m > 0) return `${m} minute(s)`;
    return `${Math.floor(ms / 1000)} seconde(s)`;
}

// ============================================
// STATS
// ============================================
function updateStats(userId, messages = 1, voice = 0) {
    db.get(`SELECT * FROM stats WHERE user_id = ?`, [userId], (err, row) => {
        if (!row) {
            db.run(`INSERT INTO stats (user_id, messages, voice) VALUES (?, ?, ?)`, [userId, messages, voice]);
        } else {
            db.run(`UPDATE stats SET messages = messages + ?, voice = voice + ? WHERE user_id = ?`, [messages, voice, userId]);
        }
    });
}

client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.guild) return;
    updateStats(msg.author.id, 1, 0);
});

client.on('voiceStateUpdate', async (old, neu) => {
    const uid = neu.member?.id || old.member?.id;
    if (!uid) return;
    if (!old.channelId && neu.channelId) updateStats(uid, 0, 0);
});

// ============================================
// TICKET SYSTEM
// ============================================
function saveTicketConfig(gid, cat, log, role) { db.run(`INSERT OR REPLACE INTO ticket_config VALUES (?, ?, ?, ?)`, [gid, cat, log, role]); }
function getTicketConfig(gid) { return new Promise((r) => { db.get(`SELECT * FROM ticket_config WHERE guild_id = ?`, [gid], (err, row) => r(row)); }); }
function saveTicket(uid, cid, gid) { db.run(`INSERT OR REPLACE INTO tickets VALUES (?, ?, ?)`, [uid, cid, gid]); }
function getTicket(uid, gid) { return new Promise((r) => { db.get(`SELECT * FROM tickets WHERE user_id = ? AND guild_id = ?`, [uid, gid], (err, row) => r(row)); }); }
function delTicket(uid, gid) { db.run(`DELETE FROM tickets WHERE user_id = ? AND guild_id = ?`, [uid, gid]); }

async function sendTicketPanel(ch) {
    const cfg = await getTicketConfig(ch.guild.id);
    if (!cfg) return ch.send('❌ Système de tickets non configuré! Utilisez `!ticketsetup`');
    const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('🎫 SUPPORT TICKET').setDescription('Cliquez ci-dessous pour créer un ticket.').setTimestamp();
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('create_ticket').setLabel('Ouvrir un ticket').setEmoji('🎫').setStyle(ButtonStyle.Primary));
    await ch.send({ embeds: [embed], components: [row] });
}

// ============================================
// REACTION ROLES
// ============================================
function saveRR(gid, mid, cid, emoji, rid) { db.run(`INSERT OR REPLACE INTO reaction_roles VALUES (?, ?, ?, ?, ?)`, [gid, mid, cid, emoji, rid]); }
function getRR(gid, mid) { return new Promise((r) => { db.all(`SELECT * FROM reaction_roles WHERE guild_id = ? AND message_id = ?`, [gid, mid], (err, rows) => r(rows || [])); }); }

async function sendRRPanel(ch, phoneId, pcId) {
    const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('📱 CHOISIS TON APPAREIL').setDescription('Clique sur ton appareil pour obtenir ton rôle!')
        .addFields({ name: '📱 Téléphone', value: `<@&${phoneId}>`, inline: true }, { name: '💻 PC', value: `<@&${pcId}>`, inline: true });
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('role_phone').setLabel('Téléphone').setEmoji('📱').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('role_pc').setLabel('PC').setEmoji('💻').setStyle(ButtonStyle.Secondary)
    );
    const msg = await ch.send({ embeds: [embed], components: [row] });
    saveRR(ch.guild.id, msg.id, ch.id, '📱', phoneId);
    saveRR(ch.guild.id, msg.id, ch.id, '💻', pcId);
}

// ============================================
// VERIFICATION SYSTEM
// ============================================
function saveVerif(gid, auto, verified, ch, img) { db.run(`INSERT OR REPLACE INTO verification VALUES (?, ?, ?, ?, ?)`, [gid, auto, verified, ch, img]); }
function getVerif(gid) { return new Promise((r) => { db.get(`SELECT * FROM verification WHERE guild_id = ?`, [gid], (err, row) => r(row)); }); }

async function sendVerifPanel(ch) {
    const cfg = await getVerif(ch.guild.id);
    if (!cfg) return ch.send('❌ Vérification non configurée! Utilisez `!verif`');
    const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('✅ VERIFICATION').setDescription(`Bienvenue sur **${ch.guild.name}**!\nClique ci-dessous pour vérifier ton compte.`)
        .setImage(cfg.image_url).setThumbnail(ch.guild.iconURL()).setTimestamp();
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('verify_button').setLabel('Vérifier').setEmoji('✅').setStyle(ButtonStyle.Success));
    await ch.send({ embeds: [embed], components: [row] });
}

// ============================================
// SETUP COLLECTORS
// ============================================
async function setupTicket(msg) {
    const filter = (m) => m.author.id === msg.author.id;
    let step = 0;
    const cfg = {};
    const questions = ['📌 Envoie l\'ID du salon de logs:', '📌 Envoie l\'ID de la catégorie pour les tickets:', '📌 Envoie l\'ID du rôle support:'];
    const names = ['log_channel', 'category', 'support_role'];
    await msg.reply(questions[0]);
    const coll = msg.channel.createMessageCollector({ filter, time: 60000, max: 3 });
    coll.on('collect', async (m) => {
        cfg[names[step]] = m.content.trim();
        step++;
        if (step < 3) await m.reply(questions[step]);
        else {
            coll.stop();
            saveTicketConfig(msg.guild.id, cfg.category, cfg.log_channel, cfg.support_role);
            await m.reply('✅ Système de tickets configuré! Utilisez `!ticket`');
        }
    });
}

async function setupRR(msg) {
    const filter = (m) => m.author.id === msg.author.id;
    let step = 0;
    const roles = {};
    const questions = ['📱 Envoie l\'ID du rôle Téléphone:', '💻 Envoie l\'ID du rôle PC:'];
    await msg.reply(questions[0]);
    const coll = msg.channel.createMessageCollector({ filter, time: 60000, max: 2 });
    coll.on('collect', async (m) => {
        roles[step === 0 ? 'phone' : 'pc'] = m.content.trim();
        step++;
        if (step < 2) await m.reply(questions[step]);
        else {
            coll.stop();
            await sendRRPanel(msg.channel, roles.phone, roles.pc);
            await m.reply('✅ Panneau des rôles créé!');
        }
    });
}

async function setupVerif(msg) {
    const filter = (m) => m.author.id === msg.author.id;
    let step = 0;
    const cfg = {};
    const questions = ['📌 Envoie l\'ID du rôle Auto (donné à l\'arrivée):', '📌 Envoie l\'ID du rôle Vérifié:', '📌 Envoie l\'ID du salon:', '📌 Envoie l\'URL de l\'image:'];
    const names = ['auto_role', 'verified_role', 'channel', 'image_url'];
    await msg.reply('🔧 Configuration de la vérification\n' + questions[0]);
    const coll = msg.channel.createMessageCollector({ filter, time: 120000, max: 4 });
    coll.on('collect', async (m) => {
        const val = m.content.trim();
        if (step < 3 && !val.match(/^\d+$/)) return m.reply('❌ Envoie un ID valide');
        if (step === 3 && !val.match(/^https?:\/\//)) return m.reply('❌ Envoie une URL valide');
        cfg[names[step]] = val;
        step++;
        if (step < 4) await m.reply(questions[step]);
        else {
            coll.stop();
            saveVerif(msg.guild.id, cfg.auto_role, cfg.verified_role, cfg.channel, cfg.image_url);
            const ch = msg.guild.channels.cache.get(cfg.channel);
            if (ch) await sendVerifPanel(ch);
            await m.reply(`✅ Vérification configurée! Panel envoyé dans <#${cfg.channel}>`);
        }
    });
}

// ============================================
// LOGS
// ============================================
client.on('messageDelete', async (msg) => {
    if (!msg.guild || msg.author?.bot) return;
    const ch = msg.guild.channels.cache.get(LOG_CHANNEL_ID);
    if (!ch) return;
    const embed = new EmbedBuilder().setColor(0xEF4444).setTitle('🗑️ Message supprimé')
        .addFields({ name: 'Auteur', value: msg.author?.tag || 'Inconnu', inline: true }, { name: 'Salon', value: `<#${msg.channel.id}>`, inline: true }, { name: 'Contenu', value: msg.content?.slice(0, 500) || 'Aucun', inline: false }).setTimestamp();
    await ch.send({ embeds: [embed] });
});

client.on('guildMemberAdd', async (member) => {
    const ch = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
    if (ch) {
        const embed = new EmbedBuilder().setColor(0x22C55E).setTitle('👋 Bienvenue!').setDescription(`${member.user.tag} a rejoint le serveur!`).setThumbnail(member.user.displayAvatarURL()).setTimestamp();
        await ch.send({ content: `${member.user}`, embeds: [embed] });
    }
    const vcfg = await getVerif(member.guild.id);
    if (vcfg?.auto_role) await member.roles.add(vcfg.auto_role);
    else if (AUTO_ROLE_ID) await member.roles.add(AUTO_ROLE_ID);
});

client.on('guildMemberRemove', async (member) => {
    const ch = member.guild.channels.cache.get(LOG_CHANNEL_ID);
    if (!ch) return;
    const embed = new EmbedBuilder().setColor(0xEF4444).setTitle('👋 Member left').setDescription(`${member.user.tag} a quitté le serveur`).setThumbnail(member.user.displayAvatarURL()).setTimestamp();
    await ch.send({ embeds: [embed] });
});

// Anti-spam
const spamMap = new Map();
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
        const w = await msg.channel.send(`${msg.author}, pas de spam!`);
        setTimeout(() => w.delete(), 3000);
    }
    if (/(https?:\/\/[^\s]+|discord\.gg\/[^\s]+)/i.test(msg.content)) {
        await msg.delete();
        const w = await msg.channel.send(`${msg.author}, les liens sont interdits!`);
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
        if (!cfg) return interaction.reply({ content: '❌ Non configuré', ephemeral: true });
        try {
            if (cfg.auto_role && interaction.member.roles.cache.has(cfg.auto_role)) await interaction.member.roles.remove(cfg.auto_role);
            await interaction.member.roles.add(cfg.verified_role);
            await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x22C55E).setTitle('✅ Vérifié!').setDescription(`Bienvenue ${interaction.guild.name}!`)], ephemeral: true });
        } catch(e) { interaction.reply({ content: '❌ Erreur', ephemeral: true }); }
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
                await interaction.reply({ content: `✅ ${interaction.member.roles.cache.has(r.id) ? 'Retiré' : 'Ajouté'} ${r.name}`, ephemeral: true });
            }
        }
    }
    else if (interaction.customId === 'create_ticket') {
        const existing = await getTicket(interaction.user.id, interaction.guild.id);
        if (existing) return interaction.reply({ content: `❌ Tu as déjà un ticket: <#${existing.channel_id}>`, ephemeral: true });
        const cfg = await getTicketConfig(interaction.guild.id);
        if (!cfg?.category) return interaction.reply({ content: '❌ Système non configuré', ephemeral: true });
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
        const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('🎫 Ticket créé').setDescription('Un membre du staff va te répondre.').setTimestamp();
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('close_ticket').setLabel('Fermer').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('claim_ticket').setLabel('Prendre en charge').setStyle(ButtonStyle.Secondary)
        );
        await ch.send({ content: `${interaction.user}`, embeds: [embed], components: [row] });
        await interaction.reply({ content: `✅ Ticket créé: ${ch}`, ephemeral: true });
    }
    else if (interaction.customId === 'close_ticket') {
        if (!isMod(interaction.member)) return interaction.reply({ content: '❌ Permission refusée', ephemeral: true });
        await delTicket(interaction.user.id, interaction.guild.id);
        await interaction.reply('🔒 Fermeture du ticket...');
        setTimeout(() => interaction.channel.delete(), 3000);
    }
    else if (interaction.customId === 'claim_ticket') {
        if (!isMod(interaction.member)) return interaction.reply({ content: '❌ Permission refusée', ephemeral: true });
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x22C55E).setTitle('🎫 Ticket pris en charge').setDescription(`${interaction.user} a pris ce ticket en charge`)] });
    }
});

// ============================================
// COMMANDES !
// ============================================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith('!')) return;
    const args = message.content.slice(1).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();
    const { member, guild, channel } = message;

    const modCmds = ['ban', 'kick', 'mute', 'unmute', 'warn', 'clear', 'lock', 'unlock', 'giverole', 'removerole', 'unban', 'ticketsetup', 'ticket', 'roltest', 'verif', 'sendpanel', 'verifstatus', 'resetverif'];
    if (modCmds.includes(cmd) && !isMod(member)) return message.reply('❌ Permission refusée!');

    // HELP
    if (cmd === 'help') {
        const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('🛡️ Commandes du Bot')
            .setDescription('**Modération:** `!ban`, `!kick`, `!mute`, `!unmute`, `!warn`, `!clear`, `!lock`, `!unlock`, `!giverole`, `!removerole`, `!unban`')
            .addFields(
                { name: 'ℹ️ Info', value: '`!userinfo`, `!serverinfo`, `!avatar`, `!infoserver`', inline: false },
                { name: '🎫 Tickets', value: '`!ticketsetup`, `!ticket`', inline: false },
                { name: '🎭 Rôles', value: '`!roltest`', inline: false },
                { name: '✅ Vérification', value: '`!verif`, `!sendpanel`, `!verifstatus`, `!resetverif`', inline: false }
            ).setTimestamp();
        return message.reply({ embeds: [embed] });
    }

    // INFOSERVER - Version propre et professionnelle
    if (cmd === 'infoserver') {
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
                { name: '👥 Membres', value: `**${total}** total\n🟢 **${online}** en ligne`, inline: true },
                { name: '🎧 Vocal', value: `**${voice}** en vocal\n🎤 **${vocal}** salons`, inline: true },
                { name: '📊 Salons', value: `💬 **${text}** texte\n🔊 **${vocal}** vocal`, inline: true },
                { name: `${level === 0 ? '⭐' : '💎'} Boost`, value: `Niveau **${level}**\n**${boosts}** boosts`, inline: true },
                { name: '📅 Création', value: `${created}`, inline: true }
            )
            .setFooter({ text: `ID: ${guild.id}` })
            .setTimestamp();
        await message.reply({ embeds: [embed] });
        return;
    }

    // SERVERINFO
    if (cmd === 'serverinfo') {
        const embed = new EmbedBuilder().setColor(0x5865F2).setTitle(guild.name).setThumbnail(guild.iconURL())
            .addFields({ name: '👑 Owner', value: `<@${guild.ownerId}>`, inline: true }, { name: '👥 Membres', value: `${guild.memberCount}`, inline: true }, { name: '📅 Créé', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true }).setTimestamp();
        await message.reply({ embeds: [embed] });
        return;
    }

    // USERINFO
    if (cmd === 'userinfo') {
        const id = args[0];
        const target = id ? await getMember(guild, id) : member;
        if (!target) return message.reply('❌ Utilisateur non trouvé');
        const embed = new EmbedBuilder().setColor(0x5865F2).setTitle(target.user.tag).setThumbnail(target.user.displayAvatarURL())
            .addFields({ name: 'ID', value: target.id, inline: true }, { name: 'Rejoint', value: `<t:${Math.floor(target.joinedTimestamp / 1000)}:R>`, inline: true }, { name: 'Compte créé', value: `<t:${Math.floor(target.user.createdTimestamp / 1000)}:R>`, inline: true }).setTimestamp();
        await message.reply({ embeds: [embed] });
        return;
    }

    // AVATAR
    if (cmd === 'avatar') {
        const id = args[0];
        const user = id ? await client.users.fetch(id) : message.author;
        const embed = new EmbedBuilder().setColor(0x5865F2).setTitle(`Avatar de ${user.tag}`).setImage(user.displayAvatarURL({ size: 1024 })).setTimestamp();
        await message.reply({ embeds: [embed] });
        return;
    }

    // BAN
    if (cmd === 'ban') {
        const id = args[0];
        if (!id) return message.reply('Usage: `!ban <id> [raison]`');
        const target = await getMember(guild, id);
        if (!target) return message.reply('❌ Utilisateur non trouvé');
        const reason = args.slice(1).join(' ') || 'Aucune raison';
        await target.ban({ reason });
        await message.reply(`✅ Banni ${target.user.tag}`);
        await sendLog(guild, 'BAN', target.user, member.user, reason);
        return;
    }

    // KICK
    if (cmd === 'kick') {
        const id = args[0];
        if (!id) return message.reply('Usage: `!kick <id> [raison]`');
        const target = await getMember(guild, id);
        if (!target) return message.reply('❌ Utilisateur non trouvé');
        const reason = args.slice(1).join(' ') || 'Aucune raison';
        await target.kick(reason);
        await message.reply(`✅ Kick ${target.user.tag}`);
        await sendLog(guild, 'KICK', target.user, member.user, reason);
        return;
    }

    // MUTE
    if (cmd === 'mute') {
        const id = args[0], time = args[1];
        if (!id || !time) return message.reply('Usage: `!mute <id> <temps> [raison]`');
        const target = await getMember(guild, id);
        if (!target) return message.reply('❌ Utilisateur non trouvé');
        const ms = parseTime(time);
        if (!ms) return message.reply('❌ Format invalide. Utilise: 10s, 5m, 2h, 1d');
        const reason = args.slice(2).join(' ') || 'Aucune raison';
        await target.timeout(ms, reason);
        await message.reply(`✅ Mute ${target.user.tag} pour ${formatTime(ms)}`);
        await sendLog(guild, 'MUTE', target.user, member.user, reason);
        return;
    }

    // UNMUTE
    if (cmd === 'unmute') {
        const id = args[0];
        if (!id) return message.reply('Usage: `!unmute <id>`');
        const target = await getMember(guild, id);
        if (!target) return message.reply('❌ Utilisateur non trouvé');
        await target.timeout(null);
        await message.reply(`✅ Unmute ${target.user.tag}`);
        await sendLog(guild, 'UNMUTE', target.user, member.user, 'Aucune raison');
        return;
    }

    // WARN
    if (cmd === 'warn') {
        const id = args[0];
        if (!id) return message.reply('Usage: `!warn <id> [raison]`');
        const target = await getMember(guild, id);
        if (!target) return message.reply('❌ Utilisateur non trouvé');
        const reason = args.slice(1).join(' ') || 'Aucune raison';
        db.run(`INSERT INTO warns (user_id, guild_id, reason, moderator, date) VALUES (?, ?, ?, ?, ?)`, [target.id, guild.id, reason, member.user.tag, new Date().toISOString()]);
        await message.reply(`✅ Warn envoyé à ${target.user.tag}`);
        await sendLog(guild, 'WARN', target.user, member.user, reason);
        return;
    }

    // CLEAR
    if (cmd === 'clear') {
        const amount = parseInt(args[0]);
        if (!amount || amount < 1 || amount > 100) return message.reply('Usage: `!clear <1-100>`');
        const fetched = await channel.messages.fetch({ limit: amount });
        const deleted = await channel.bulkDelete(fetched);
        const reply = await message.reply(`✅ Supprimé ${deleted.size} messages`);
        setTimeout(() => reply.delete(), 3000);
        return;
    }

    // LOCK
    if (cmd === 'lock') {
        await channel.permissionOverwrites.edit(guild.id, { SendMessages: false });
        await message.reply('🔒 Salon verrouillé');
        return;
    }

    // UNLOCK
    if (cmd === 'unlock') {
        await channel.permissionOverwrites.edit(guild.id, { SendMessages: null });
        await message.reply('🔓 Salon déverrouillé');
        return;
    }

    // GIVEROLE
    if (cmd === 'giverole') {
        const uid = args[0], rid = args[1];
        if (!uid || !rid) return message.reply('Usage: `!giverole <id> <roleid>`');
        const target = await getMember(guild, uid);
        const role = guild.roles.cache.get(rid);
        if (!target || !role) return message.reply('❌ Utilisateur ou rôle non trouvé');
        await target.roles.add(role);
        await message.reply(`✅ Ajouté ${role.name} à ${target.user.tag}`);
        return;
    }

    // REMOVEROLE
    if (cmd === 'removerole') {
        const uid = args[0], rid = args[1];
        if (!uid || !rid) return message.reply('Usage: `!removerole <id> <roleid>`');
        const target = await getMember(guild, uid);
        const role = guild.roles.cache.get(rid);
        if (!target || !role) return message.reply('❌ Utilisateur ou rôle non trouvé');
        await target.roles.remove(role);
        await message.reply(`✅ Retiré ${role.name} de ${target.user.tag}`);
        return;
    }

    // UNBAN
    if (cmd === 'unban') {
        const uid = args[0];
        if (!uid) return message.reply('Usage: `!unban <id>`');
        const user = await client.users.fetch(uid);
        await guild.members.unban(user);
        await message.reply(`✅ Unban ${user.tag}`);
        return;
    }

    // TICKET SETUP
    if (cmd === 'ticketsetup') { await setupTicket(message); return; }
    if (cmd === 'ticket') { await sendTicketPanel(channel); return; }

    // REACTION ROLES
    if (cmd === 'roltest') { await setupRR(message); return; }

    // VERIFICATION
    if (cmd === 'verif') { await setupVerif(message); return; }
    if (cmd === 'resetverif') { db.run(`DELETE FROM verification WHERE guild_id = ?`, [guild.id]); message.reply('✅ Vérification réinitialisée'); return; }
    if (cmd === 'sendpanel') { const cfg = await getVerif(guild.id); if (!cfg) return message.reply('❌ Non configuré'); const ch = guild.channels.cache.get(cfg.channel); if (ch) await sendVerifPanel(ch); message.reply(`✅ Panel envoyé dans ${ch}`); return; }
    if (cmd === 'verifstatus') { const cfg = await getVerif(guild.id); if (!cfg) return message.reply('❌ Non configuré'); const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('État de la vérification').addFields({ name: 'Rôle Auto', value: `<@&${cfg.auto_role}>`, inline: true }, { name: 'Rôle Vérifié', value: `<@&${cfg.verified_role}>`, inline: true }, { name: 'Salon', value: `<#${cfg.channel}>`, inline: true }); message.reply({ embeds: [embed] }); return; }
});

// ============================================
// READY
// ============================================
client.once('ready', () => {
    console.log(`✅ ${client.user.tag} est en ligne!`);
    console.log(`📋 Préfixe: !`);
    client.user.setActivity('!help | Premium Bot', { type: 3 });
});

// ============================================
// SHUTDOWN
// ============================================
process.on('SIGINT', () => { db.close(() => process.exit(0)); });
process.on('unhandledRejection', (err) => console.error('❌ Erreur:', err.message));

client.login(BOT_TOKEN);
