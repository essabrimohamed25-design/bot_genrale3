const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, ChannelType } = require('discord.js');
const { joinVoiceChannel, getVoiceConnection, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');
const axios = require('axios');

// ============================================
// ENVIRONMENT VARIABLES
// ============================================
if (process.env.NODE_ENV !== 'production') {
    try { require('dotenv').config(); } catch (error) {}
}

const BOT_TOKEN = process.env.BOT_TOKEN;
const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const MOD_ROLE_ID = process.env.MOD_ROLE_ID;
const VOICE_CHANNEL_ID = process.env.VOICE_CHANNEL_ID || "1485406556542472322";

// Validation
if (!BOT_TOKEN) { console.error('❌ BOT_TOKEN is missing!'); process.exit(1); }
if (!WELCOME_CHANNEL_ID) { console.error('❌ WELCOME_CHANNEL_ID is missing!'); process.exit(1); }
if (!LOG_CHANNEL_ID) { console.error('❌ LOG_CHANNEL_ID is missing!'); process.exit(1); }
if (!MOD_ROLE_ID) { console.error('❌ MOD_ROLE_ID is missing!'); process.exit(1); }

// ============================================
// XP SYSTEM DATA (In-memory storage)
// ============================================
// In a production environment, you would store this in a database
const userXP = new Map(); // userID -> { xp, level, totalXP }

// XP calculation functions
function getLevelFromXP(totalXP) {
    return Math.floor(Math.sqrt(totalXP / 100)) + 1;
}

function getXPForLevel(level) {
    return Math.pow(level - 1, 2) * 100;
}

function getXPProgress(currentXP, level) {
    const xpForCurrentLevel = getXPForLevel(level);
    const xpForNextLevel = getXPForLevel(level + 1);
    const xpNeeded = xpForNextLevel - xpForCurrentLevel;
    const xpGained = currentXP - xpForCurrentLevel;
    return (xpGained / xpNeeded) * 100;
}

// Helper to get or initialize user XP data
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

// Award XP for messages
function awardXP(userId) {
    const data = getUserXPData(userId);
    const earnedXP = Math.floor(Math.random() * 15) + 5; // 5-20 XP per message
    
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

// Get rank of a user
function getUserRank(userId) {
    const sortedUsers = Array.from(userXP.entries())
        .sort((a, b) => b[1].totalXP - a[1].totalXP)
        .map(entry => entry[0]);
    
    const rank = sortedUsers.indexOf(userId) + 1;
    return rank > 0 ? rank : null;
}

// ============================================
// CANVAS PROFILE CARD GENERATION
// ============================================
async function generateProfileCard(user, xpData, rank) {
    // Canvas dimensions
    const width = 1000;
    const height = 450;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // Load background image
    const backgroundUrl = 'https://media.discordapp.net/attachments/1480969775344652470/1496647110525845625/DF7E4FDA-66D3-49FF-BD5E-7C746253AE2D.png';
    const backgroundImg = await loadImage(backgroundUrl);
    
    // Draw background
    ctx.drawImage(backgroundImg, 0, 0, width, height);
    
    // Add dark overlay for readability (gradient)
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.75)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.85)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    
    // Add subtle border
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 2;
    ctx.strokeRect(5, 5, width - 10, height - 10);
    
    // Add glow effect (shadow)
    ctx.shadowColor = '#00ff88';
    ctx.shadowBlur = 15;
    
    // ===== AVATAR =====
    // Load user avatar
    const avatarURL = user.displayAvatarURL({ extension: 'png', size: 256 });
    const avatarImg = await loadImage(avatarURL);
    
    // Create circular avatar with glow
    const avatarSize = 128;
    const avatarX = 60;
    const avatarY = height / 2 - avatarSize / 2;
    
    // Avatar background circle (glow)
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize/2, avatarY + avatarSize/2, avatarSize/2 + 3, 0, Math.PI * 2);
    ctx.fillStyle = '#00ff88';
    ctx.fill();
    
    // Clip circle for avatar
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize/2, avatarY + avatarSize/2, avatarSize/2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    
    // Draw avatar
    ctx.drawImage(avatarImg, avatarX, avatarY, avatarSize, avatarSize);
    ctx.restore();
    
    // Reset shadow
    ctx.shadowBlur = 0;
    
    // ===== USERNAME =====
    ctx.font = 'bold 36px "Arial"';
    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = 5;
    ctx.shadowColor = '#00ff88';
    const username = user.username;
    ctx.fillText(username, 220, height/2 - 100);
    
    // User ID/tag (smaller)
    ctx.font = '20px "Arial"';
    ctx.fillStyle = '#aaaaaa';
    ctx.shadowBlur = 2;
    ctx.fillText('@' + user.discriminator + ' • #' + user.id.slice(-5), 220, height/2 - 65);
    
    // ===== STATS SECTION =====
    const statsY = height/2 - 20;
    
    // Level
    ctx.font = 'bold 24px "Arial"';
    ctx.fillStyle = '#00ff88';
    ctx.fillText('LEVEL', 220, statsY);
    
    ctx.font = 'bold 42px "Arial"';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(xpData.level, 220, statsY + 48);
    
    // Rank
    ctx.font = 'bold 24px "Arial"';
    ctx.fillStyle = '#00ff88';
    ctx.fillText('RANK', 400, statsY);
    
    ctx.font = 'bold 42px "Arial"';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(rank ? `#${rank}` : 'N/A', 400, statsY + 48);
    
    // Total XP
    ctx.font = 'bold 24px "Arial"';
    ctx.fillStyle = '#00ff88';
    ctx.fillText('TOTAL XP', 580, statsY);
    
    ctx.font = 'bold 36px "Arial"';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(xpData.totalXP.toLocaleString(), 580, statsY + 45);
    
    // ===== PROGRESS BAR =====
    const progressY = height - 90;
    const progressX = 220;
    const progressWidth = 700;
    const progressHeight = 25;
    
    // Calculate XP progress
    const currentLevelXP = getXPForLevel(xpData.level);
    const nextLevelXP = getXPForLevel(xpData.level + 1);
    const xpNeeded = nextLevelXP - currentLevelXP;
    const xpGained = xpData.totalXP - currentLevelXP;
    const progressPercent = (xpGained / xpNeeded) * 100;
    
    // Progress bar background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(progressX, progressY, progressWidth, progressHeight);
    
    // Progress bar fill with gradient
    const progressGradient = ctx.createLinearGradient(progressX, progressY, progressX + progressWidth, progressY);
    progressGradient.addColorStop(0, '#00ff88');
    progressGradient.addColorStop(1, '#00cc66');
    ctx.fillStyle = progressGradient;
    ctx.fillRect(progressX, progressY, (progressWidth * progressPercent) / 100, progressHeight);
    
    // Progress bar border
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 2;
    ctx.strokeRect(progressX, progressY, progressWidth, progressHeight);
    
    // Progress text
    ctx.font = '16px "Arial"';
    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = 0;
    const progressText = `${xpGained} / ${xpNeeded} XP (${Math.round(progressPercent)}%)`;
    const textWidth = ctx.measureText(progressText).width;
    ctx.fillText(progressText, progressX + (progressWidth - textWidth) / 2, progressY - 8);
    
    // XP to next level text
    ctx.font = '14px "Arial"';
    ctx.fillStyle = '#aaaaaa';
    ctx.fillText(`${xpNeeded - xpGained} XP needed for level ${xpData.level + 1}`, progressX + progressWidth - 200, progressY - 8);
    
    // ===== BOTTOM STATS =====
    ctx.font = '16px "Arial"';
    ctx.fillStyle = '#888888';
    const messagesSent = xpData.messages || 0;
    ctx.fillText(`${messagesSent} messages • Joined: ${user.createdAt.toLocaleDateString()}`, 60, height - 30);
    
    // Return buffer
    return canvas.toBuffer();
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

const startTime = Date.now();
let currentVoiceConnection = null;
let reconnectTimeout = null;

// ============================================
// VOICE CHANNEL MANAGEMENT (Using @discordjs/voice)
// ============================================
async function joinVoiceChannelProper() {
    if (!VOICE_CHANNEL_ID) {
        console.log('⚠️ No VOICE_CHANNEL_ID configured, skipping voice join');
        return;
    }

    try {
        const guild = client.guilds.cache.first();
        if (!guild) {
            console.log('⚠️ No guild found, waiting for ready event');
            return;
        }

        const voiceChannel = guild.channels.cache.get(VOICE_CHANNEL_ID);
        if (!voiceChannel) {
            console.log(`⚠️ Voice channel ${VOICE_CHANNEL_ID} not found`);
            return;
        }

        if (voiceChannel.type !== ChannelType.GuildVoice) {
            console.log(`⚠️ Channel ${VOICE_CHANNEL_ID} is not a voice channel`);
            return;
        }

        // Check if already connected to the correct channel
        const existingConnection = getVoiceConnection(guild.id);
        if (existingConnection && existingConnection.joinConfig.channelId === VOICE_CHANNEL_ID) {
            console.log(`✅ Already connected to voice channel: ${voiceChannel.name}`);
            return;
        }

        // Leave existing connection if any
        if (existingConnection) {
            existingConnection.destroy();
            console.log('🔌 Destroyed existing voice connection');
        }

        // Join the voice channel
        const connection = joinVoiceChannel({
            channelId: VOICE_CHANNEL_ID,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: false
        });

        currentVoiceConnection = connection;

        // Handle connection states
        connection.on(VoiceConnectionStatus.Ready, () => {
            console.log(`🎤 Successfully joined voice channel: ${voiceChannel.name} (${VOICE_CHANNEL_ID})`);
            // Clear reconnect timeout on successful connection
            if (reconnectTimeout) {
                clearTimeout(reconnectTimeout);
                reconnectTimeout = null;
            }
        });

        connection.on(VoiceConnectionStatus.Disconnected, async () => {
            console.log(`⚠️ Disconnected from voice channel, attempting to reconnect...`);
            try {
                // Wait 5 seconds then try to reconnect
                await entersState(connection, VoiceConnectionStatus.Signalling, 5_000);
                console.log('🔄 Reconnecting to voice channel...');
            } catch (error) {
                console.log('❌ Failed to reconnect, destroying connection...');
                connection.destroy();
                currentVoiceConnection = null;
                // Schedule rejoin after 10 seconds
                if (!reconnectTimeout) {
                    reconnectTimeout = setTimeout(() => {
                        reconnectTimeout = null;
                        joinVoiceChannelProper();
                    }, 10000);
                }
            }
        });

        connection.on(VoiceConnectionStatus.Destroyed, () => {
            console.log('🔌 Voice connection destroyed');
            currentVoiceConnection = null;
            // Schedule rejoin after 10 seconds
            if (!reconnectTimeout) {
                reconnectTimeout = setTimeout(() => {
                    reconnectTimeout = null;
                    joinVoiceChannelProper();
                }, 10000);
            }
        });

        connection.on('error', (error) => {
            console.error('❌ Voice connection error:', error.message);
        });

        // Wait for connection to be ready
        await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
        
    } catch (error) {
        console.error(`❌ Failed to join voice channel: ${error.message}`);
        // Schedule rejoin after 30 seconds
        if (!reconnectTimeout) {
            reconnectTimeout = setTimeout(() => {
                reconnectTimeout = null;
                joinVoiceChannelProper();
            }, 30000);
        }
    }
}

// Periodic check to ensure bot stays connected
setInterval(async () => {
    try {
        const guild = client.guilds.cache.first();
        if (!guild || !client.isReady()) return;

        const voiceChannel = guild.channels.cache.get(VOICE_CHANNEL_ID);
        if (!voiceChannel) return;

        const connection = getVoiceConnection(guild.id);
        
        // If no connection exists but should, reconnect
        if (!connection && VOICE_CHANNEL_ID) {
            console.log('🔍 No voice connection found, reconnecting...');
            await joinVoiceChannelProper();
        }
        
        // If connection exists but is in disconnected state
        if (connection && connection.state.status === VoiceConnectionStatus.Disconnected) {
            console.log('🔍 Connection in disconnected state, attempting to recover...');
            try {
                await entersState(connection, VoiceConnectionStatus.Signalling, 5_000);
            } catch (error) {
                connection.destroy();
                currentVoiceConnection = null;
                await joinVoiceChannelProper();
            }
        }
    } catch (error) {
        // Silently handle periodic check errors
    }
}, 30000); // Check every 30 seconds

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
                '!say <message> - Make the bot say something\n' +
                '!info - Generate your gaming profile card\n' +
                '!help - Show this help panel\n' +
                '```', inline: false }
        )
        .setFooter({ text: `⚠️ Moderation commands require <@&${MOD_ROLE_ID}> role` })
        .setTimestamp();
    
    await message.reply({ embeds: [embed] });
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
            .setImage('https://media.discordapp.net/attachments/1480969775344652470/1496647172148559983/BBCD65E5-E8A2-47BB-80A0-0A208431F3A6.png')
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
    
    // Award XP for normal messages (not commands)
    if (!message.content.startsWith('!')) {
        const { earnedXP, leveledUp, newLevel } = awardXP(message.author.id);
        
        if (leveledUp) {
            // Send level up message
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
    
    // Help command - no permission needed
    if (command === 'help') return showHelp(message);
    
    // Check mod permission for moderation commands
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
            await sendLog(message, `Clear (${deleted.size} messages)`, { id: 'N/A', tag: 'Channel' }, `Deleted ${deleted.size} messages`);
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
    
    // ========== INFO (Profile Card) ==========
    else if (command === 'info') {
        try {
            // Send typing indicator
            await message.channel.sendTyping();
            
            // Get user's XP data and rank
            const xpData = getUserXPData(message.author.id);
            const rank = getUserRank(message.author.id);
            
            // Generate profile card
            const profileBuffer = await generateProfileCard(message.author, xpData, rank);
            
            // Send the image
            await message.reply({
                content: `🎮 **${message.author.username}'s Gaming Profile**`,
                files: [{
                    attachment: profileBuffer,
                    name: `profile_${message.author.id}.png`
                }]
            });
        } catch (error) {
            console.error('Error generating profile card:', error);
            await sendError(message, 'Failed to generate profile card. Please try again later.');
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
    console.log(`👋 Welcome channel: ${WELCOME_CHANNEL_ID}`);
    console.log(`📝 Log channel: ${LOG_CHANNEL_ID}`);
    console.log(`👮 Mod role: ${MOD_ROLE_ID}`);
    console.log(`🎤 Voice channel: ${VOICE_CHANNEL_ID}`);
    console.log(`🚀 Bot is ready with 12+ commands including !info!`);
    console.log(`💡 Commands work in ANY channel`);
    console.log(`🔊 Using @discordjs/voice for stable voice connections`);
    console.log(`🎮 XP System enabled - users earn XP for messages!`);
    
    // Auto join voice channel on startup (wait 3 seconds for guild to be ready)
    setTimeout(async () => {
        await joinVoiceChannelProper();
    }, 3000);
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
