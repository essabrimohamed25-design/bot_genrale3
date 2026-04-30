const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, ChannelType } = require('discord.js');
const { joinVoiceChannel, getVoiceConnection, VoiceConnectionStatus, entersState } = require('@discordjs/voice');

// ============================================
// ENVIRONMENT VARIABLES
// ============================================
const BOT_TOKEN = process.env.BOT_TOKEN;
const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const MOD_ROLE_ID = process.env.MOD_ROLE_ID;
const VOICE_CHANNEL_ID = process.env.VOICE_CHANNEL_ID;

// Validation
if (!BOT_TOKEN) {
    console.error('❌ BOT_TOKEN is missing!');
    process.exit(1);
}

// ============================================
// CLIENT INITIALIZATION
// ============================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildVoiceStates
    ]
});

let currentVoiceConnection = null;
let reconnectTimeout = null;

// ============================================
// XP SYSTEM (In-memory with basic persistence)
// ============================================
const userXP = new Map();

function getLevelFromXP(totalXP) {
    return Math.floor(Math.sqrt(totalXP / 100)) + 1;
}

function getXPForLevel(level) {
    return Math.pow(level - 1, 2) * 100;
}

function getUserXPData(userId) {
    if (!userXP.has(userId)) {
        userXP.set(userId, {
            totalXP: 0,
            level: 1,
            messages: 0
        });
    }
    return userXP.get(userId);
}

function awardXP(userId) {
    const data = getUserXPData(userId);
    const earnedXP = Math.floor(Math.random() * 15) + 5;
    
    data.totalXP += earnedXP;
    data.messages++;
    
    const newLevel = getLevelFromXP(data.totalXP);
    let leveledUp = false;
    
    if (newLevel > data.level) {
        data.level = newLevel;
        leveledUp = true;
    }
    
    userXP.set(userId, data);
    return { earnedXP, leveledUp, newLevel: data.level };
}

function getUserRank(userId) {
    const sortedUsers = Array.from(userXP.entries())
        .sort((a, b) => b[1].totalXP - a[1].totalXP)
        .map(entry => entry[0]);
    
    const rank = sortedUsers.indexOf(userId) + 1;
    return rank > 0 ? rank : null;
}

// ============================================
// VOICE CHANNEL MANAGEMENT
// ============================================
async function joinVoiceChannelProper() {
    if (!VOICE_CHANNEL_ID) {
        console.log('⚠️ No VOICE_CHANNEL_ID configured');
        return;
    }

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

        connection.on(VoiceConnectionStatus.Ready, () => {
            console.log(`✅ Connected to voice channel: ${voiceChannel.name}`);
            if (reconnectTimeout) {
                clearTimeout(reconnectTimeout);
                reconnectTimeout = null;
            }
        });

        connection.on(VoiceConnectionStatus.Disconnected, async () => {
            console.log(`⚠️ Disconnected, reconnecting...`);
            try {
                await entersState(connection, VoiceConnectionStatus.Signalling, 5_000);
            } catch (error) {
                connection.destroy();
                currentVoiceConnection = null;
                if (!reconnectTimeout) {
                    reconnectTimeout = setTimeout(() => {
                        reconnectTimeout = null;
                        joinVoiceChannelProper();
                    }, 10000);
                }
            }
        });

        await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
        
    } catch (error) {
        console.error(`❌ Voice connection error: ${error.message}`);
        if (!reconnectTimeout) {
            reconnectTimeout = setTimeout(() => {
                reconnectTimeout = null;
                joinVoiceChannelProper();
            }, 30000);
        }
    }
}

// Periodic voice connection check
setInterval(async () => {
    try {
        const guild = client.guilds.cache.first();
        if (!guild || !client.isReady()) return;
        
        const connection = getVoiceConnection(guild.id);
        if (!connection && VOICE_CHANNEL_ID) {
            await joinVoiceChannelProper();
        }
    } catch (error) {}
}, 30000);

// ============================================
// HELPER FUNCTIONS
// ============================================
async function sendLog(message, action, target, reason) {
    try {
        const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
        if (!logChannel) return;
        
        const logEmbed = new EmbedBuilder()
            .setColor(0xFF6B6B)
            .setTitle(`🔨 ${action}`)
            .setThumbnail(message.author.displayAvatarURL())
            .addFields(
                { name: '👮 Executor', value: `${message.author.tag} (${message.author.id})`, inline: true },
                { name: '🎯 Target', value: `${target.user?.tag || target.tag || target} (${target.id || target})`, inline: true },
                { name: '📝 Reason', value: reason || 'No reason provided', inline: false },
                { name: '📍 Channel', value: `<#${message.channel.id}>`, inline: true }
            )
            .setTimestamp();
        
        await logChannel.send({ embeds: [logEmbed] });
    } catch (error) {
        console.error('Log error:', error);
    }
}

async function sendSuccess(message, action, target, duration = null) {
    const embed = new EmbedBuilder()
        .setColor(0x4CAF50)
        .setTitle(`✅ ${action}`)
        .setDescription(`Successfully applied ${action.toLowerCase()} to <@${target.id}>`)
        .addFields(
            { name: 'Moderator', value: message.author.tag, inline: true },
            { name: 'Target', value: target.user?.tag || target.tag, inline: true }
        );
    
    if (duration) embed.addFields({ name: 'Duration', value: duration, inline: true });
    embed.setTimestamp();
    await message.reply({ embeds: [embed] });
}

async function sendError(message, errorText) {
    const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('❌ Error')
        .setDescription(errorText)
        .setTimestamp();
    await message.reply({ embeds: [embed] });
}

function hasModPermission(member) {
    if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
    return member.roles.cache.has(MOD_ROLE_ID);
}

function parseTime(timeString) {
    const match = timeString.match(/^(\d+)([mhd])$/);
    if (!match) return null;
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    switch(unit) {
        case 'm': return value * 60 * 1000;
        case 'h': return value * 60 * 60 * 1000;
        case 'd': return value * 24 * 60 * 60 * 1000;
        default: return null;
    }
}

function formatDuration(ms) {
    const minutes = Math.floor(ms / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days} day(s)`;
    if (hours > 0) return `${hours} hour(s)`;
    if (minutes > 0) return `${minutes} minute(s)`;
    return 'unknown';
}

async function getTarget(message, userId) {
    try {
        return await message.guild.members.fetch(userId);
    } catch (error) {
        return null;
    }
}

async function showHelp(message) {
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🛡️ Moderation Bot - Help Panel')
        .setDescription('Here are all available commands:')
        .setThumbnail(message.guild.iconURL())
        .addFields(
            { name: '🛠️ MODERATION', value: '```\n' +
                '!ban <userID> [reason] - Permanently ban a user\n' +
                '!kick <userID> [reason] - Kick a user from the server\n' +
                '!timeout <userID> <time> [reason] - Timeout user (10m/1h/1d)\n' +
                '!unmute <userID> [reason] - Remove timeout from user\n' +
                '!clear <amount> - Delete messages (1-100)\n' +
                '!warn <userID> [reason] - Send a warning to user\n' +
                '```', inline: false },
            { name: 'ℹ️ INFORMATION', value: '```\n' +
                '!ping - Check bot latency\n' +
                '!avatar [userID] - Show user avatar\n' +
                '!userinfo [userID] - Show user information\n' +
                '!serverinfo - Show server information\n' +
                '!profile [userID] - Show gaming profile with XP stats\n' +
                '!leaderboard - Show top 10 XP leaders\n' +
                '!say <message> - Make the bot say something\n' +
                '!help - Show this help panel\n' +
                '```', inline: false }
        )
        .setFooter({ text: `⚠️ Moderation commands require <@&${MOD_ROLE_ID}> role` })
        .setTimestamp();
    
    await message.reply({ embeds: [embed] });
}

// ============================================
// PROFILE COMMAND (Embed-based, no Canvas)
// ============================================
async function showProfile(message, userId = null) {
    try {
        let user = message.author;
        let member = message.member;
        
        if (userId) {
            const fetchedMember = await getTarget(message, userId);
            if (fetchedMember) {
                member = fetchedMember;
                user = fetchedMember.user;
            }
        }
        
        const xpData = getUserXPData(user.id);
        const rank = getUserRank(user.id);
        
        const currentLevelXP = getXPForLevel(xpData.level);
        const nextLevelXP = getXPForLevel(xpData.level + 1);
        const xpNeeded = nextLevelXP - currentLevelXP;
        const xpGained = xpData.totalXP - currentLevelXP;
        const progressPercent = Math.round((xpGained / xpNeeded) * 100);
        
        // Create progress bar
        const barLength = 20;
        const filledBars = Math.round((progressPercent / 100) * barLength);
        const emptyBars = barLength - filledBars;
        const progressBar = '█'.repeat(filledBars) + '░'.repeat(emptyBars);
        
        const profileEmbed = new EmbedBuilder()
            .setColor(0x00ff88)
            .setTitle(`🎮 ${user.username}'s Gaming Profile`)
            .setThumbnail(user.displayAvatarURL({ size: 1024, dynamic: true }))
            .addFields(
                { name: '📊 Level', value: `**${xpData.level}**`, inline: true },
                { name: '🏆 Rank', value: `**${rank ? `#${rank}` : 'N/A'}**`, inline: true },
                { name: '✨ Total XP', value: `**${xpData.totalXP.toLocaleString()}**`, inline: true },
                { name: '💬 Messages', value: `**${xpData.messages.toLocaleString()}**`, inline: true },
                { name: '📈 XP Progress', value: `\`${progressBar}\` **${progressPercent}%**\n${xpGained}/${xpNeeded} XP`, inline: false },
                { name: '🎯 Next Level', value: `${xpNeeded - xpGained} XP needed for Level ${xpData.level + 1}`, inline: false },
                { name: '📅 Joined', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true }
            )
            .setFooter({ text: `ID: ${user.id} • Keep chatting to earn XP!` })
            .setTimestamp();
        
        if (member?.joinedTimestamp) {
            profileEmbed.addFields({ name: '📅 Server Joined', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true });
        }
        
        await message.reply({ embeds: [profileEmbed] });
    } catch (error) {
        console.error('Profile error:', error);
        await sendError(message, 'Failed to generate profile.');
    }
}

async function showLeaderboard(message) {
    try {
        const sortedUsers = Array.from(userXP.entries())
            .sort((a, b) => b[1].totalXP - a[1].totalXP)
            .slice(0, 10);
        
        if (sortedUsers.length === 0) {
            return sendError(message, 'No XP data available yet!');
        }
        
        const leaderboardText = [];
        for (let i = 0; i < sortedUsers.length; i++) {
            const [userId, data] = sortedUsers[i];
            try {
                const user = await client.users.fetch(userId);
                leaderboardText.push(`**${i + 1}.** ${user.tag} - Level ${data.level} (${data.totalXP.toLocaleString()} XP)`);
            } catch (error) {
                leaderboardText.push(`**${i + 1}.** Unknown User - Level ${data.level} (${data.totalXP.toLocaleString()} XP)`);
            }
        }
        
        const embed = new EmbedBuilder()
            .setColor(0x00ff88)
            .setTitle('🏆 XP Leaderboard')
            .setDescription(leaderboardText.join('\n'))
            .setFooter({ text: 'Keep chatting to earn XP and rank up!' })
            .setTimestamp();
        
        await message.reply({ embeds: [embed] });
    } catch (error) {
        console.error('Leaderboard error:', error);
        await sendError(message, 'Failed to load leaderboard.');
    }
}

// ============================================
// WELCOME SYSTEM
// ============================================
client.on('guildMemberAdd', async (member) => {
    try {
        const welcomeChannel = client.channels.cache.get(WELCOME_CHANNEL_ID);
        if (!welcomeChannel) return;

        const welcomeEmbed = new EmbedBuilder()
            .setColor(0x4CAF50)
            .setTitle(`🎉 Welcome to ${member.guild.name}! 🎉`)
            .setDescription(
                `${member.toString()} has joined the server!\n\n` +
                `**Username:** ${member.user.username}\n` +
                `**User ID:** ${member.id}\n\n` +
                `✨ You are member #${member.guild.memberCount}\n\n` +
                `📖 Please read the rules\n` +
                `🎭 Pick your roles\n` +
                `💬 Introduce yourself\n\n` +
                `**Have fun and make new friends! 🎉**`
            )
            .setThumbnail(member.user.displayAvatarURL({ size: 1024, dynamic: true }))
            .setFooter({ text: `ID: ${member.id} • Welcome!` })
            .setTimestamp();

        await welcomeChannel.send({ content: `${member.toString()}`, embeds: [welcomeEmbed] });
        console.log(`✅ Welcome message sent for ${member.user.tag}`);
    } catch (error) {
        console.error('Welcome error:', error);
    }
});

// ============================================
// XP SYSTEM - Award XP for messages
// ============================================
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.guild) return;
    
    if (!message.content.startsWith('!')) {
        const { earnedXP, leveledUp, newLevel } = awardXP(message.author.id);
        
        if (leveledUp) {
            const levelUpEmbed = new EmbedBuilder()
                .setColor(0x00ff88)
                .setTitle('🎉 LEVEL UP! 🎉')
                .setDescription(`${message.author} has reached **Level ${newLevel}**!`)
                .addFields(
                    { name: '✨ Total XP', value: getUserXPData(message.author.id).totalXP.toLocaleString(), inline: true },
                    { name: '📊 Messages', value: getUserXPData(message.author.id).messages.toLocaleString(), inline: true }
                )
                .setTimestamp();
            
            await message.channel.send({ embeds: [levelUpEmbed] }).catch(() => {});
        }
    }
});

// ============================================
// COMMAND HANDLER
// ============================================
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith('!')) return;
    
    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    
    // Public commands (no permission needed)
    if (command === 'help') return showHelp(message);
    if (command === 'profile') {
        const userId = args[0];
        return showProfile(message, userId);
    }
    if (command === 'leaderboard') return showLeaderboard(message);
    
    // Moderation commands - check permission
    const modCommands = ['ban', 'kick', 'timeout', 'unmute', 'clear', 'warn'];
    if (modCommands.includes(command) && !hasModPermission(message.member)) {
        return sendError(message, `You need the <@&${MOD_ROLE_ID}> role to use moderation commands!`);
    }
    
    // ========== BAN ==========
    if (command === 'ban') {
        const userId = args[0];
        if (!userId) return sendError(message, 'Usage: `!ban <userID> [reason]`');
        
        const target = await getTarget(message, userId);
        if (!target) return sendError(message, 'User not found!');
        if (!target.bannable) return sendError(message, 'I cannot ban this user!');
        
        const reason = args.slice(1).join(' ') || 'No reason provided';
        
        try {
            await target.ban({ reason: `${reason} (Banned by ${message.author.tag})` });
            await sendSuccess(message, 'Ban', target);
            await sendLog(message, 'Ban', target, reason);
        } catch (error) {
            sendError(message, 'Failed to ban user.');
        }
    }
    
    // ========== KICK ==========
    else if (command === 'kick') {
        const userId = args[0];
        if (!userId) return sendError(message, 'Usage: `!kick <userID> [reason]`');
        
        const target = await getTarget(message, userId);
        if (!target) return sendError(message, 'User not found!');
        if (!target.kickable) return sendError(message, 'I cannot kick this user!');
        
        const reason = args.slice(1).join(' ') || 'No reason provided';
        
        try {
            await target.kick(`${reason} (Kicked by ${message.author.tag})`);
            await sendSuccess(message, 'Kick', target);
            await sendLog(message, 'Kick', target, reason);
        } catch (error) {
            sendError(message, 'Failed to kick user.');
        }
    }
    
    // ========== TIMEOUT ==========
    else if (command === 'timeout') {
        const userId = args[0];
        const timeAmount = args[1];
        
        if (!userId || !timeAmount) {
            return sendError(message, 'Usage: `!timeout <userID> <time> [reason]`\nExamples: `!timeout 123456789 10m`, `!timeout 123456789 1h`, `!timeout 123456789 1d`');
        }
        
        const target = await getTarget(message, userId);
        if (!target) return sendError(message, 'User not found!');
        if (!target.moderatable) return sendError(message, 'I cannot timeout this user!');
        
        const durationMs = parseTime(timeAmount);
        if (!durationMs) return sendError(message, 'Invalid time format! Use: 10m, 1h, 1d');
        if (durationMs > 28 * 24 * 60 * 60 * 1000) return sendError(message, 'Timeout cannot be longer than 28 days!');
        
        const reason = args.slice(2).join(' ') || 'No reason provided';
        const durationReadable = formatDuration(durationMs);
        
        try {
            await target.timeout(durationMs, `${reason} (Timed out by ${message.author.tag})`);
            await sendSuccess(message, `Timeout (${durationReadable})`, target, durationReadable);
            await sendLog(message, 'Timeout', target, reason);
        } catch (error) {
            sendError(message, 'Failed to timeout user.');
        }
    }
    
    // ========== UNMUTE ==========
    else if (command === 'unmute') {
        const userId = args[0];
        if (!userId) return sendError(message, 'Usage: `!unmute <userID> [reason]`');
        
        const target = await getTarget(message, userId);
        if (!target) return sendError(message, 'User not found!');
        if (!target.moderatable) return sendError(message, 'I cannot remove timeout from this user!');
        if (!target.communicationDisabledUntil) return sendError(message, 'This user is not currently timed out!');
        
        const reason = args.slice(1).join(' ') || 'No reason provided';
        
        try {
            await target.timeout(null);
            await sendSuccess(message, 'Unmute', target);
            await sendLog(message, 'Unmute', target, reason);
        } catch (error) {
            sendError(message, 'Failed to unmute user.');
        }
    }
    
    // ========== CLEAR ==========
    else if (command === 'clear') {
        const amount = parseInt(args[0]);
        if (!amount || amount < 1 || amount > 100) return sendError(message, 'Usage: `!clear <1-100>`');
        
        try {
            const deleted = await message.channel.bulkDelete(amount, true);
            const confirmEmbed = new EmbedBuilder()
                .setColor(0x4CAF50)
                .setTitle('✅ Messages Cleared')
                .setDescription(`Deleted ${deleted.size} messages`)
                .setTimestamp();
            
            const reply = await message.reply({ embeds: [confirmEmbed] });
            setTimeout(() => reply.delete(), 3000);
            if (LOG_CHANNEL_ID) {
                await sendLog(message, `Clear (${deleted.size} messages)`, { id: 'N/A', tag: 'Channel' }, `Deleted ${deleted.size} messages`);
            }
        } catch (error) {
            sendError(message, 'Failed to clear messages. Messages may be older than 14 days!');
        }
    }
    
    // ========== WARN ==========
    else if (command === 'warn') {
        const userId = args[0];
        if (!userId) return sendError(message, 'Usage: `!warn <userID> [reason]`');
        
        const target = await getTarget(message, userId);
        if (!target) return sendError(message, 'User not found!');
        
        const reason = args.slice(1).join(' ') || 'No reason provided';
        
        const warnEmbed = new EmbedBuilder()
            .setColor(0xFFA500)
            .setTitle('⚠️ Warning')
            .setDescription(`You have been warned in **${message.guild.name}**`)
            .addFields(
                { name: 'Moderator', value: message.author.tag, inline: true },
                { name: 'Reason', value: reason, inline: true }
            )
            .setTimestamp();
        
        try {
            await target.send({ embeds: [warnEmbed] }).catch(() => {});
            await sendSuccess(message, 'Warning', target);
            await sendLog(message, 'Warning', target, reason);
        } catch (error) {
            sendError(message, 'Failed to warn user.');
        }
    }
    
    // ========== PING ==========
    else if (command === 'ping') {
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('🏓 Pong!')
            .addFields(
                { name: 'Latency', value: `${Date.now() - message.createdTimestamp}ms`, inline: true },
                { name: 'API Latency', value: `${Math.round(client.ws.ping)}ms`, inline: true }
            )
            .setTimestamp();
        await message.reply({ embeds: [embed] });
    }
    
    // ========== AVATAR ==========
    else if (command === 'avatar') {
        const userId = args[0];
        let user = message.author;
        
        if (userId) {
            try {
                const fetchedUser = await client.users.fetch(userId);
                if (fetchedUser) user = fetchedUser;
            } catch (error) {}
        }
        
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`${user.tag}'s Avatar`)
            .setImage(user.displayAvatarURL({ size: 1024, dynamic: true }))
            .setTimestamp();
        await message.reply({ embeds: [embed] });
    }
    
    // ========== USERINFO ==========
    else if (command === 'userinfo') {
        const userId = args[0];
        let member = message.member;
        
        if (userId) {
            const target = await getTarget(message, userId);
            if (target) member = target;
        }
        
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(member.user.tag)
            .setThumbnail(member.user.displayAvatarURL())
            .addFields(
                { name: '🆔 ID', value: member.id, inline: true },
                { name: '📅 Joined Server', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true },
                { name: '📅 Joined Discord', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true }
            );
        
        if (member.communicationDisabledUntil) {
            embed.addFields({ name: '🔇 Timed out until', value: `<t:${Math.floor(member.communicationDisabledUntil / 1000)}:R>`, inline: false });
        }
        
        embed.setTimestamp();
        await message.reply({ embeds: [embed] });
    }
    
    // ========== SERVERINFO ==========
    else if (command === 'serverinfo') {
        const guild = message.guild;
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(guild.name)
            .setThumbnail(guild.iconURL())
            .addFields(
                { name: '👑 Owner', value: `<@${guild.ownerId}>`, inline: true },
                { name: '👥 Members', value: `${guild.memberCount}`, inline: true },
                { name: '📅 Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
                { name: '💬 Channels', value: `${guild.channels.cache.size}`, inline: true },
                { name: '🎭 Roles', value: `${guild.roles.cache.size}`, inline: true }
            )
            .setTimestamp();
        await message.reply({ embeds: [embed] });
    }
    
    // ========== SAY ==========
    else if (command === 'say') {
        const text = args.join(' ');
        if (!text) return sendError(message, 'Usage: `!say <message>`');
        await message.channel.send(text);
        await message.delete();
    }
});

// ============================================
// READY EVENT
// ============================================
client.once('ready', async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    console.log(`🎮 XP System Active - Users earn XP for messages!`);
    console.log(`🤖 Bot is ready with ${client.guilds.cache.size} guild(s)`);
    
    if (VOICE_CHANNEL_ID) {
        setTimeout(async () => {
            await joinVoiceChannelProper();
        }, 3000);
    }
});

// ============================================
// ERROR HANDLING
// ============================================
process.on('unhandledRejection', (error) => {
    console.error('❌ Unhandled rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught exception:', error);
});

// ============================================
// START BOT
// ============================================
client.login(BOT_TOKEN);
