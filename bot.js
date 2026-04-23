const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, ChannelType } = require('discord.js');
const canvacord = require('canvacord');

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
const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID;

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
if (!WELCOME_CHANNEL_ID) {
    console.error('❌ WELCOME_CHANNEL_ID is missing!');
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

// ========== START TIME FOR UPTIME ==========
const startTime = Date.now();

// ========== HELPER FUNCTIONS ==========

// Send log to log channel
async function sendLog(message, action, target, reason, details = null) {
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

        if (details) {
            logEmbed.addFields({ name: 'ℹ️ Details', value: details, inline: false });
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
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days} day(s) ${hours % 24} hour(s)`;
    if (hours > 0) return `${hours} hour(s) ${minutes % 60} minute(s)`;
    if (minutes > 0) return `${minutes} minute(s) ${seconds % 60} second(s)`;
    return `${seconds} second(s)`;
}

// Get target user
async function getTarget(message, userId) {
    try {
        return await message.guild.members.fetch(userId);
    } catch (error) {
        return null;
    }
}

// Format uptime
function getUptime() {
    return formatDuration(Date.now() - startTime);
}

// ========== WELCOME IMAGE GENERATOR ==========
async function generateWelcomeImage(member) {
    try {
        const avatarURL = member.user.displayAvatarURL({ extension: 'png', size: 256 });
        
        const welcomeCard = new canvacord.Welcomer()
            .setUsername(member.user.username)
            .setDiscriminator(member.user.discriminator)
            .setAvatar(avatarURL)
            .setMemberCount(member.guild.memberCount)
            .setGuildName(member.guild.name)
            .setColor("title", "#ff3333")
            .setColor("username-box", "#2d0000")
            .setColor("discriminator-box", "#2d0000")
            .setColor("message-box", "#1a0000")
            .setColor("border", "#ff0000")
            .setColor("avatar", "#ff3333")
            .setText("title", "WELCOME")
            .setText("message", `Welcome to ${member.guild.name}`)
            .setText("member-count", `Member #${member.guild.memberCount}`);
        
        return await welcomeCard.build();
    } catch (error) {
        console.error('Welcome image error:', error);
        return null;
    }
}

// ========== HELP COMMAND ==========
async function showHelp(message) {
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🛡️ Advanced Moderation Bot - Help Panel')
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
                '!lock - Lock the current channel\n' +
                '!unlock - Unlock the current channel\n' +
                '!slowmode <seconds> - Set slowmode (0 to disable)\n' +
                '!nick <userID> <nickname> - Change user nickname\n' +
                '!addrole <userID> <roleID> - Add role to user\n' +
                '!removerole <userID> <roleID> - Remove role from user\n' +
                '```', inline: false },
            { name: '📢 UTILITY', value: '```\n' +
                '!say <message> - Make the bot say something\n' +
                '!embed <title> | <description> - Send an embed message\n' +
                '!announce <message> - Send an announcement\n' +
                '```', inline: false },
            { name: 'ℹ️ INFORMATION', value: '```\n' +
                '!ping - Check bot latency\n' +
                '!avatar [userID] - Show user avatar\n' +
                '!userinfo [userID] - Show user information\n' +
                '!serverinfo - Show server information\n' +
                '!roleinfo <roleID> - Show role information\n' +
                '!botinfo - Show bot information\n' +
                '!uptime - Show bot uptime\n' +
                '!help - Show this help panel\n' +
                '```', inline: false }
        )
        .setFooter({ text: `⚠️ Moderation commands require <@&${MOD_ROLE_ID}> role | Total Commands: 25+` })
        .setTimestamp();

    await message.reply({ embeds: [embed] });
}

// ========== WELCOME SYSTEM ==========
client.on('guildMemberAdd', async (member) => {
    try {
        const welcomeChannel = client.channels.cache.get(WELCOME_CHANNEL_ID);
        if (!welcomeChannel) return;

        const welcomeImage = await generateWelcomeImage(member);
        
        const welcomeEmbed = new EmbedBuilder()
            .setColor(0xff3333)
            .setTitle(`🎉 WELCOME ${member.user.username.toUpperCase()}! 🎉`)
            .setDescription(
                `${member.toString()} has joined the server!\n\n` +
                `✨ **Member #${member.guild.memberCount}**\n\n` +
                `📖 Please check out the rules\n` +
                `🎭 Get your roles\n` +
                `💬 Introduce yourself\n\n` +
                `**Have an amazing time here! 🚀**`
            )
            .setFooter({ text: `ID: ${member.id} • Welcome to the family!` })
            .setTimestamp();
        
        if (welcomeImage) {
            welcomeEmbed.setImage('attachment://welcome.png');
            await welcomeChannel.send({
                content: member.toString(),
                embeds: [welcomeEmbed],
                files: [{ attachment: welcomeImage, name: 'welcome.png' }]
            });
        } else {
            welcomeEmbed.setThumbnail(member.user.displayAvatarURL());
            await welcomeChannel.send({ content: member.toString(), embeds: [welcomeEmbed] });
        }
        
        console.log(`✅ Welcome sent for ${member.user.tag}`);
    } catch (error) {
        console.error('Welcome error:', error);
    }
});

// ========== COMMAND HANDLER ==========
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith('!')) return;
    
    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    
    // Help command - no permission needed
    if (command === 'help') return showHelp(message);
    
    // Check mod permission for moderation commands
    const modCommands = ['ban', 'kick', 'timeout', 'unmute', 'clear', 'warn', 'lock', 'unlock', 'slowmode', 'nick', 'addrole', 'removerole'];
    if (modCommands.includes(command) && !hasModPermission(message.member)) {
        return sendError(message, `You need the <@&${MOD_ROLE_ID}> role to use this command!`);
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
            await sendLog(message, 'Timeout', target, reason, durationReadable);
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
    
    // ========== LOCK ==========
    else if (command === 'lock') {
        try {
            await message.channel.permissionOverwrites.edit(message.guild.id, {
                SendMessages: false
            });
            const embed = new EmbedBuilder().setColor(0xFF0000).setTitle('🔒 Channel Locked').setDescription(`This channel has been locked by ${message.author.tag}`).setTimestamp();
            await message.reply({ embeds: [embed] });
            await sendLog(message, 'Lock', { id: message.channel.id, tag: message.channel.name }, 'Channel locked');
        } catch (error) {
            sendError(message, 'Failed to lock channel. Check my permissions!');
        }
    }
    
    // ========== UNLOCK ==========
    else if (command === 'unlock') {
        try {
            await message.channel.permissionOverwrites.edit(message.guild.id, {
                SendMessages: null
            });
            const embed = new EmbedBuilder().setColor(0x00FF00).setTitle('🔓 Channel Unlocked').setDescription(`This channel has been unlocked by ${message.author.tag}`).setTimestamp();
            await message.reply({ embeds: [embed] });
            await sendLog(message, 'Unlock', { id: message.channel.id, tag: message.channel.name }, 'Channel unlocked');
        } catch (error) {
            sendError(message, 'Failed to unlock channel.');
        }
    }
    
    // ========== SLOWMODE ==========
    else if (command === 'slowmode') {
        const seconds = parseInt(args[0]);
        if (isNaN(seconds)) return sendError(message, 'Usage: `!slowmode <seconds>` (0 to disable)');
        
        try {
            await message.channel.setRateLimitPerUser(seconds);
            const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('⏱️ Slowmode Updated').setDescription(`Slowmode set to ${seconds} seconds`).setTimestamp();
            await message.reply({ embeds: [embed] });
            await sendLog(message, 'Slowmode', { id: message.channel.id, tag: message.channel.name }, `Set to ${seconds} seconds`);
        } catch (error) {
            sendError(message, 'Failed to set slowmode.');
        }
    }
    
    // ========== NICK ==========
    else if (command === 'nick') {
        const userId = args[0];
        const nickname = args.slice(1).join(' ');
        if (!userId || !nickname) return sendError(message, 'Usage: `!nick <userID> <nickname>`');
        
        const target = await getTarget(message, userId);
        if (!target) return sendError(message, 'User not found!');
        
        try {
            await target.setNickname(nickname);
            const embed = new EmbedBuilder().setColor(0x4CAF50).setTitle('✅ Nickname Changed').setDescription(`Changed ${target.user.tag}'s nickname to ${nickname}`).setTimestamp();
            await message.reply({ embeds: [embed] });
            await sendLog(message, 'Nickname Change', target, `New nickname: ${nickname}`);
        } catch (error) {
            sendError(message, 'Failed to change nickname. I may not have permission or the user is higher than me.');
        }
    }
    
    // ========== ADDROLE ==========
    else if (command === 'addrole') {
        const userId = args[0];
        const roleId = args[1];
        if (!userId || !roleId) return sendError(message, 'Usage: `!addrole <userID> <roleID>`');
        
        const target = await getTarget(message, userId);
        if (!target) return sendError(message, 'User not found!');
        
        const role = message.guild.roles.cache.get(roleId);
        if (!role) return sendError(message, 'Role not found!');
        
        try {
            await target.roles.add(role);
            const embed = new EmbedBuilder().setColor(0x4CAF50).setTitle('✅ Role Added').setDescription(`Added ${role.name} to ${target.user.tag}`).setTimestamp();
            await message.reply({ embeds: [embed] });
            await sendLog(message, 'Add Role', target, `Role: ${role.name} (${role.id})`);
        } catch (error) {
            sendError(message, 'Failed to add role.');
        }
    }
    
    // ========== REMOVEROLE ==========
    else if (command === 'removerole') {
        const userId = args[0];
        const roleId = args[1];
        if (!userId || !roleId) return sendError(message, 'Usage: `!removerole <userID> <roleID>`');
        
        const target = await getTarget(message, userId);
        if (!target) return sendError(message, 'User not found!');
        
        const role = message.guild.roles.cache.get(roleId);
        if (!role) return sendError(message, 'Role not found!');
        
        try {
            await target.roles.remove(role);
            const embed = new EmbedBuilder().setColor(0x4CAF50).setTitle('✅ Role Removed').setDescription(`Removed ${role.name} from ${target.user.tag}`).setTimestamp();
            await message.reply({ embeds: [embed] });
            await sendLog(message, 'Remove Role', target, `Role: ${role.name} (${role.id})`);
        } catch (error) {
            sendError(message, 'Failed to remove role.');
        }
    }
    
    // ========== SAY ==========
    else if (command === 'say') {
        const text = args.join(' ');
        if (!text) return sendError(message, 'Usage: `!say <message>`');
        await message.channel.send(text);
        await message.delete();
    }
    
    // ========== EMBED ==========
    else if (command === 'embed') {
        const text = args.join(' ');
        if (!text) return sendError(message, 'Usage: `!embed <title> | <description>`');
        
        const [title, description] = text.split('|').map(s => s.trim());
        if (!title || !description) return sendError(message, 'Usage: `!embed <title> | <description>`');
        
        const embed = new EmbedBuilder().setColor(0x5865F2).setTitle(title).setDescription(description).setTimestamp();
        await message.channel.send({ embeds: [embed] });
        await message.delete();
    }
    
    // ========== ANNOUNCE ==========
    else if (command === 'announce') {
        const text = args.join(' ');
        if (!text) return sendError(message, 'Usage: `!announce <message>`');
        
        const embed = new EmbedBuilder().setColor(0xFF0000).setTitle('📢 ANNOUNCEMENT').setDescription(text).setFooter({ text: `Announced by ${message.author.tag}` }).setTimestamp();
        await message.channel.send({ embeds: [embed] });
        await message.delete();
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
                { name: '📅 Joined Discord', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
                { name: '🎭 Roles', value: member.roles.cache.map(r => r.name).join(', ').slice(0, 1024) || 'None', inline: false }
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
                { name: '🎭 Roles', value: `${guild.roles.cache.size}`, inline: true },
                { name: '✅ Boosts', value: `${guild.premiumSubscriptionCount || 0}`, inline: true }
            )
            .setTimestamp();
        await message.reply({ embeds: [embed] });
    }
    
    // ========== ROLEINFO ==========
    else if (command === 'roleinfo') {
        const roleId = args[0];
        if (!roleId) return sendError(message, 'Usage: `!roleinfo <roleID>`');
        
        const role = message.guild.roles.cache.get(roleId);
        if (!role) return sendError(message, 'Role not found!');
        
        const embed = new EmbedBuilder()
            .setColor(role.color)
            .setTitle(`Role Information: ${role.name}`)
            .addFields(
                { name: '🆔 ID', value: role.id, inline: true },
                { name: '🎨 Color', value: role.hexColor, inline: true },
                { name: '📅 Created', value: `<t:${Math.floor(role.createdTimestamp / 1000)}:R>`, inline: true },
                { name: '👥 Members', value: `${role.members.size}`, inline: true },
                { name: '🔝 Position', value: `${role.position}`, inline: true },
                { name: '📌 Mentionable', value: role.mentionable ? 'Yes' : 'No', inline: true }
            )
            .setTimestamp();
        await message.reply({ embeds: [embed] });
    }
    
    // ========== BOTINFO ==========
    else if (command === 'botinfo') {
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('🤖 Bot Information')
            .setThumbnail(client.user.displayAvatarURL())
            .addFields(
                { name: '📛 Name', value: client.user.tag, inline: true },
                { name: '🆔 ID', value: client.user.id, inline: true },
                { name: '📅 Created', value: `<t:${Math.floor(client.user.createdTimestamp / 1000)}:R>`, inline: true },
                { name: '💻 Servers', value: `${client.guilds.cache.size}`, inline: true },
                { name: '👥 Users', value: `${client.users.cache.size}`, inline: true },
                { name: '📚 Commands', value: '25+', inline: true },
                { name: '🟢 Status', value: 'Online', inline: true },
                { name: '📦 Node.js', value: process.version, inline: true },
                { name: '🤖 Discord.js', value: 'v14', inline: true }
            )
            .setTimestamp();
        await message.reply({ embeds: [embed] });
    }
    
    // ========== UPTIME ==========
    else if (command === 'uptime') {
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('⏱️ Bot Uptime')
            .setDescription(`I have been online for **${getUptime()}**`)
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
    console.log(`🚀 Bot is ready with 25+ commands!`);
});

// ========== ERROR HANDLING ==========
process.on('unhandledRejection', (error) => {
    console.error('❌ Unhandled rejection:', error);
});

// ========== START BOT ==========
client.login(BOT_TOKEN);
