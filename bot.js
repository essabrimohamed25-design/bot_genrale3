const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } = require('discord.js');
const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');

// Load dotenv only for local development
if (process.env.NODE_ENV !== 'production') {
    try {
        require('dotenv').config();
    } catch (error) {}
}

// Environment variables
const BOT_TOKEN = process.env.BOT_TOKEN;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const MOD_ROLE_ID = process.env.MOD_ROLE_ID;
const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID || '1496836534815686836';

// Validation
if (!BOT_TOKEN) {
    console.error('❌ BOT_TOKEN is missing!');
    process.exit(1);
}
if (!LOG_CHANNEL_ID) {
    console.error('❌ LOG_CHANNEL_ID is missing!');
    process.exit(1);
}
if (!MOD_ROLE_ID) {
    console.error('❌ MOD_ROLE_ID is missing!');
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration
    ]
});

// ========== WELCOME IMAGE GENERATOR ==========
async function generateWelcomeImage(member) {
    try {
        // Create canvas (1200 x 500 pixels)
        const width = 1200;
        const height = 500;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // Background gradient (Dark Red to Black theme)
        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, '#1a0000');
        gradient.addColorStop(0.5, '#2d0000');
        gradient.addColorStop(1, '#0a0000');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        // Add decorative diagonal lines
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.3;
        for (let i = -height; i < width + height; i += 40) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i + height, height);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;

        // Draw border
        ctx.strokeStyle = '#ff3333';
        ctx.lineWidth = 5;
        ctx.strokeRect(10, 10, width - 20, height - 20);

        // Draw "WELCOME" text (large, bold)
        ctx.font = 'bold 80px "Arial"';
        ctx.fillStyle = '#ff3333';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 10;
        ctx.textAlign = 'center';
        ctx.fillText('WELCOME', width / 2, 100);
        
        // Draw "TO" text
        ctx.font = '40px "Arial"';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('TO', width / 2, 160);

        // Draw server name
        ctx.font = 'bold 45px "Arial"';
        ctx.fillStyle = '#ff4444';
        ctx.fillText('CJ & RCS CRACK', width / 2, 220);

        // Draw avatar circle
        const avatarSize = 150;
        const avatarX = width / 2 - avatarSize / 2;
        const avatarY = 240;
        
        // Fetch user's avatar
        const avatarURL = member.user.displayAvatarURL({ extension: 'png', size: 256 });
        const avatarImage = await loadImage(avatarURL);
        
        // Create circular clip
        ctx.save();
        ctx.beginPath();
        ctx.arc(width / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        
        // Draw avatar
        ctx.drawImage(avatarImage, avatarX, avatarY, avatarSize, avatarSize);
        ctx.restore();
        
        // Draw avatar border
        ctx.beginPath();
        ctx.arc(width / 2, avatarY + avatarSize / 2, avatarSize / 2 + 5, 0, Math.PI * 2);
        ctx.strokeStyle = '#ff3333';
        ctx.lineWidth = 4;
        ctx.stroke();

        // Draw username
        let username = member.user.username;
        if (username.length > 20) {
            username = username.substring(0, 18) + '...';
        }
        
        ctx.font = 'bold 36px "Arial"';
        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 5;
        ctx.fillText(username, width / 2, avatarY + avatarSize + 45);
        
        // Draw discriminator/display name line
        ctx.font = '20px "Arial"';
        ctx.fillStyle = '#ff8888';
        ctx.fillText(`@${member.user.discriminator === '0' ? member.user.username.toLowerCase() : member.user.tag}`, width / 2, avatarY + avatarSize + 80);
        
        // Draw decorative elements - stars
        ctx.fillStyle = '#ff0000';
        ctx.shadowBlur = 8;
        for (let i = 0; i < 15; i++) {
            const starX = 30 + Math.random() * (width - 60);
            const starY = 30 + Math.random() * (height - 310);
            ctx.beginPath();
            ctx.arc(starX, starY, 2 + Math.random() * 3, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.shadowBlur = 0;
        
        // Add member count at bottom
        ctx.font = '18px "Arial"';
        ctx.fillStyle = '#888888';
        ctx.textAlign = 'center';
        ctx.fillText(`Member #${member.guild.memberCount} • You are welcome!`, width / 2, height - 30);
        
        // Return buffer
        return canvas.toBuffer();
        
    } catch (error) {
        console.error('Welcome image generation error:', error);
        return null;
    }
}

// ========== HELPER FUNCTIONS ==========

// Send log to log channel
async function sendLog(message, action, target, reason, duration = null) {
    try {
        const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
        if (!logChannel) {
            console.log('⚠️ Log channel not found');
            return;
        }

        const logEmbed = new EmbedBuilder()
            .setColor(0xFF6B6B)
            .setTitle(`🔨 ${action}`)
            .setThumbnail(message.author.displayAvatarURL())
            .addFields(
                { name: '👮 Executor', value: `${message.author.tag} (${message.author.id})`, inline: true },
                { name: '🎯 Target', value: `${target.user?.tag || target.tag} (${target.id})`, inline: true },
                { name: '📝 Reason', value: reason || 'No reason provided', inline: false },
                { name: '📍 Channel', value: `<#${message.channel.id}>`, inline: true }
            )
            .setTimestamp();

        if (duration) {
            logEmbed.addFields({ name: '⏱️ Duration', value: duration, inline: true });
        }

        await logChannel.send({ embeds: [logEmbed] });
    } catch (error) {
        console.error('Log error:', error);
    }
}

// Send success message
async function sendSuccess(message, action, target, duration = null) {
    const embed = new EmbedBuilder()
        .setColor(0x4CAF50)
        .setTitle(`✅ ${action}`)
        .setDescription(`Successfully applied ${action.toLowerCase()} to <@${target.id}>`)
        .addFields(
            { name: 'Moderator', value: message.author.tag, inline: true },
            { name: 'Target', value: target.user?.tag || target.tag, inline: true }
        );
    
    if (duration) {
        embed.addFields({ name: 'Duration', value: duration, inline: true });
    }
    
    embed.setTimestamp();
    await message.reply({ embeds: [embed] });
}

// Send error message
async function sendError(message, errorText) {
    const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('❌ Error')
        .setDescription(errorText)
        .setTimestamp();
    await message.reply({ embeds: [embed] });
}

// Check if user has mod permissions
function hasModPermission(member) {
    if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
    return member.roles.cache.has(MOD_ROLE_ID);
}

// Parse time string (10m, 1h, 1d)
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

// Format milliseconds to readable string
function formatDuration(ms) {
    const minutes = Math.floor(ms / 60000);
    const hours = Math.floor(ms / 3600000);
    const days = Math.floor(ms / 86400000);
    
    if (days > 0) return `${days} day(s)`;
    if (hours > 0) return `${hours} hour(s)`;
    if (minutes > 0) return `${minutes} minute(s)`;
    return 'unknown';
}

// Get target user
async function getTarget(message, userId) {
    try {
        return await message.guild.members.fetch(userId);
    } catch (error) {
        return null;
    }
}

// ========== HELP COMMAND ==========
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
                '!mute <userID> <time> [reason] - Timeout a user (10m/1h/1d)\n' +
                '!unmute <userID> [reason] - Remove timeout from user\n' +
                '!clear <amount> - Delete messages (1-100)\n' +
                '!warn <userID> [reason] - Send a warning to user\n' +
                '```', inline: false },
            { name: '🔧 UTILITY', value: '```\n' +
                '!avatar [userID] - Show user avatar\n' +
                '!serverinfo - Show server information\n' +
                '!userinfo [userID] - Show user information\n' +
                '!ping - Check bot latency\n' +
                '!help - Show this help panel\n' +
                '```', inline: false }
        )
        .setFooter({ text: `⚠️ Moderation commands require <@&${MOD_ROLE_ID}> role` })
        .setTimestamp();

    await message.reply({ embeds: [embed] });
}

// ========== WELCOME SYSTEM ==========
client.on('guildMemberAdd', async (member) => {
    try {
        const welcomeChannel = client.channels.cache.get(WELCOME_CHANNEL_ID);
        if (!welcomeChannel) {
            console.log('⚠️ Welcome channel not found');
            return;
        }

        // Generate welcome image
        const welcomeImageBuffer = await generateWelcomeImage(member);
        
        if (!welcomeImageBuffer) {
            // Fallback if image generation fails
            const fallbackEmbed = new EmbedBuilder()
                .setColor(0x4CAF50)
                .setTitle('**Welcome to 𝘾𝙅 & 𝙍𝘾𝙎 𝙘𝙧𝙖𝙘𝙠 { }**')
                .setDescription(
                    `Welcome ${member.toString()}!\n` +
                    `You joined the server successfully!\n\n` +
                    `• Read the rules\n` +
                    `• Pick your roles\n` +
                    `• Enjoy the community\n\n` +
                    `Have fun and make new friends 🎉`
                )
                .setImage('https://media.discordapp.net/attachments/1480969775344652470/1496647110525845625/DF7E4FDA-66D3-49FF-BD5E-7C746253AE2D.png')
                .setFooter({ text: `Member #${member.guild.memberCount} • We're glad to have you!` })
                .setTimestamp();
            
            await welcomeChannel.send({ content: `${member.toString()}`, embeds: [fallbackEmbed] });
            return;
        }
        
        // Create welcome embed with generated image
        const welcomeEmbed = new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle(`🎉 Welcome ${member.user.username}! 🎉`)
            .setDescription(
                `✨ **${member.toString()}** has joined the server!\n\n` +
                `📖 Please read the rules in <#${WELCOME_CHANNEL_ID}>\n` +
                `🎭 Pick your roles to unlock channels\n` +
                `💬 Introduce yourself in general chat\n\n` +
                `**We're now at ${member.guild.memberCount} members!**`
            )
            .setImage('attachment://welcome.png')
            .setFooter({ text: `ID: ${member.id} • Welcome to the family!` })
            .setTimestamp();
        
        // Send the welcome message with the generated image
        await welcomeChannel.send({
            content: `${member.toString()}`, // This mentions the user clearly
            embeds: [welcomeEmbed],
            files: [{
                attachment: welcomeImageBuffer,
                name: 'welcome.png'
            }]
        });
        
        console.log(`✅ Welcome message sent for ${member.user.tag}`);
        
    } catch (error) {
        console.error('Welcome system error:', error);
    }
});

// ========== COMMAND HANDLER ==========
client.on('messageCreate', async (message) => {
    // Ignore bots
    if (message.author.bot) return;
    
    // Check for command prefix
    if (!message.content.startsWith('!')) return;
    
    // Parse command
    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    
    // Help command - no permission needed
    if (command === 'help') {
        return showHelp(message);
    }
    
    // Check mod permission for moderation commands
    const moderationCommands = ['ban', 'kick', 'mute', 'unmute', 'clear', 'warn'];
    if (moderationCommands.includes(command) && !hasModPermission(message.member)) {
        return sendError(message, `You need the <@&${MOD_ROLE_ID}> role to use moderation commands!`);
    }
    
    // ========== BAN COMMAND ==========
    if (command === 'ban') {
        const userId = args[0];
        if (!userId) return sendError(message, 'Usage: `!ban <userID> [reason]`');
        
        if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
            return sendError(message, 'You need the "Ban Members" permission!');
        }
        
        const target = await getTarget(message, userId);
        if (!target) return sendError(message, 'User not found!');
        if (!target.bannable) return sendError(message, 'I cannot ban this user!');
        
        const reason = args.slice(1).join(' ') || 'No reason provided';
        
        try {
            await target.ban({ reason: `${reason} (Banned by ${message.author.tag})` });
            await sendSuccess(message, 'Ban', target);
            await sendLog(message, 'Ban', target, reason);
        } catch (error) {
            console.error(error);
            return sendError(message, 'Failed to ban user. Check my permissions!');
        }
    }
    
    // ========== KICK COMMAND ==========
    else if (command === 'kick') {
        const userId = args[0];
        if (!userId) return sendError(message, 'Usage: `!kick <userID> [reason]`');
        
        if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
            return sendError(message, 'You need the "Kick Members" permission!');
        }
        
        const target = await getTarget(message, userId);
        if (!target) return sendError(message, 'User not found!');
        if (!target.kickable) return sendError(message, 'I cannot kick this user!');
        
        const reason = args.slice(1).join(' ') || 'No reason provided';
        
        try {
            await target.kick(`${reason} (Kicked by ${message.author.tag})`);
            await sendSuccess(message, 'Kick', target);
            await sendLog(message, 'Kick', target, reason);
        } catch (error) {
            console.error(error);
            return sendError(message, 'Failed to kick user. Check my permissions!');
        }
    }
    
    // ========== MUTE/TIMEOUT COMMAND ==========
    else if (command === 'mute') {
        const userId = args[0];
        const timeAmount = args[1];
        
        if (!userId || !timeAmount) {
            return sendError(message, 'Usage: `!mute <userID> <time> [reason]`\nExamples: `!mute 123456789 10m Spamming`, `!mute 123456789 1h`, `!mute 123456789 1d`');
        }
        
        if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
            return sendError(message, 'You need the "Moderate Members" permission!');
        }
        
        const target = await getTarget(message, userId);
        if (!target) return sendError(message, 'User not found!');
        
        if (!target.moderatable) {
            return sendError(message, 'I cannot timeout this user! They may have higher permissions than me.');
        }
        
        const durationMs = parseTime(timeAmount);
        if (!durationMs) {
            return sendError(message, 'Invalid time format! Use: 10m (minutes), 1h (hours), 1d (days)');
        }
        
        if (durationMs > 28 * 24 * 60 * 60 * 1000) {
            return sendError(message, 'Timeout cannot be longer than 28 days!');
        }
        
        const reason = args.slice(2).join(' ') || 'No reason provided';
        const durationReadable = formatDuration(durationMs);
        
        try {
            await target.timeout(durationMs, `${reason} (Timed out by ${message.author.tag})`);
            await sendSuccess(message, `Mute (${durationReadable})`, target, durationReadable);
            await sendLog(message, 'Mute', target, reason, durationReadable);
        } catch (error) {
            console.error(error);
            return sendError(message, 'Failed to mute user. Check my permissions!');
        }
    }
    
    // ========== UNMUTE COMMAND ==========
    else if (command === 'unmute') {
        const userId = args[0];
        if (!userId) return sendError(message, 'Usage: `!unmute <userID> [reason]`');
        
        if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
            return sendError(message, 'You need the "Moderate Members" permission!');
        }
        
        const target = await getTarget(message, userId);
        if (!target) return sendError(message, 'User not found!');
        
        if (!target.moderatable) {
            return sendError(message, 'I cannot remove timeout from this user!');
        }
        
        if (!target.communicationDisabledUntil) {
            return sendError(message, 'This user is not currently muted!');
        }
        
        const reason = args.slice(1).join(' ') || 'No reason provided';
        
        try {
            await target.timeout(null);
            await sendSuccess(message, 'Unmute', target);
            await sendLog(message, 'Unmute', target, reason);
        } catch (error) {
            console.error(error);
            return sendError(message, 'Failed to unmute user. Check my permissions!');
        }
    }
    
    // ========== CLEAR COMMAND ==========
    else if (command === 'clear') {
        const amount = parseInt(args[0]);
        if (!amount || amount < 1 || amount > 100) {
            return sendError(message, 'Usage: `!clear <1-100>`');
        }
        
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
            return sendError(message, 'You need the "Manage Messages" permission!');
        }
        
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
            console.error(error);
            return sendError(message, 'Failed to clear messages. Messages may be older than 14 days!');
        }
    }
    
    // ========== WARN COMMAND ==========
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
            await target.send({ embeds: [warnEmbed] }).catch(() => {
                console.log('Could not DM user');
            });
            await sendSuccess(message, 'Warning', target);
            await sendLog(message, 'Warning', target, reason);
        } catch (error) {
            console.error(error);
            return sendError(message, 'Failed to warn user.');
        }
    }
    
    // ========== AVATAR COMMAND ==========
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
    
    // ========== SERVERINFO COMMAND ==========
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
    
    // ========== USERINFO COMMAND ==========
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
            embed.addFields({ name: '🔇 Muted until', value: `<t:${Math.floor(member.communicationDisabledUntil / 1000)}:R>`, inline: false });
        } else {
            embed.addFields({ name: '🔇 Muted', value: 'Not muted', inline: false });
        }
        
        embed.setTimestamp();
        await message.reply({ embeds: [embed] });
    }
    
    // ========== PING COMMAND ==========
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
});

// ========== READY EVENT ==========
client.once('ready', () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    console.log(`📝 Log channel: ${LOG_CHANNEL_ID}`);
    console.log(`👮 Mod role: ${MOD_ROLE_ID}`);
    console.log(`👋 Welcome channel: ${WELCOME_CHANNEL_ID}`);
    console.log(`🚀 Bot is ready!`);
    console.log(`💡 Commands work in ANY channel`);
});

// ========== ERROR HANDLING ==========
process.on('unhandledRejection', (error) => {
    console.error('❌ Unhandled promise rejection:', error);
});

// ========== START BOT ==========
client.login(BOT_TOKEN);
