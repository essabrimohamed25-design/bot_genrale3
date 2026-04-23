const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } = require('discord.js');

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

// Helper function to send logs
async function sendLog(message, action, target, reason) {
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
                { name: '📝 Reason', value: reason, inline: false },
                { name: '📍 Channel', value: `<#${message.channel.id}>`, inline: true }
            )
            .setTimestamp();

        await logChannel.send({ embeds: [logEmbed] });
    } catch (error) {
        console.error('Log error:', error);
    }
}

// Helper function to send success message
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

// Helper function to send error message
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

// Help command
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
                '!timeout <userID> <time> [reason] - Same as mute\n' +
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

client.once('ready', () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    console.log(`📝 Log channel: ${LOG_CHANNEL_ID}`);
    console.log(`👮 Mod role: ${MOD_ROLE_ID}`);
    console.log(`🚀 Bot is ready!`);
    console.log(`💡 Commands work in ANY channel`);
});

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
    
    // Check mod permission for all other commands
    const moderationCommands = ['ban', 'kick', 'mute', 'timeout', 'unmute', 'clear', 'warn'];
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
    else if (command === 'mute' || command === 'timeout') {
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
            await sendSuccess(message, `Timeout (${durationReadable})`, target, durationReadable);
            await sendLog(message, `Timeout (${durationReadable})`, target, reason);
        } catch (error) {
            console.error(error);
            return sendError(message, 'Failed to timeout user. Check my permissions!');
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
            return sendError(message, 'This user is not currently timed out!');
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
            embed.addFields({ name: '🔇 Timed out until', value: `<t:${Math.floor(member.communicationDisabledUntil / 1000)}:R>`, inline: false });
        } else {
            embed.addFields({ name: '🔇 Timeout', value: 'Not timed out', inline: false });
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

// Error handling
process.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error);
});

// Login
client.login(BOT_TOKEN);
import discord
from discord.ext import commands
import random
import os

# ===== BOT SETUP =====
intents = discord.Intents.default()
intents.message_content = True
intents.members = True

bot = commands.Bot(command_prefix='!', intents=intents)

# ===== 8BALL RESPONSES =====
responses = [
    "It is certain.",
    "Without a doubt.",
    "Yes definitely.",
    "Most likely.",
    "Outlook good.",
    "Yes.",
    "Reply hazy, try again.",
    "Ask again later.",
    "Cannot predict now.",
    "Don't count on it.",
    "My reply is no.",
    "Very doubtful."
]

# ===== READY EVENT =====
@bot.event
async def on_ready():
    print(f"✅ Logged in as {bot.user}")

# ===== 8BALL COMMAND =====
@bot.command(name='8ball')
async def eight_ball(ctx, *, question: str):
    response = random.choice(responses)

    embed = discord.Embed(
        title="🎱 Magic 8Ball",
        description=f"**Question:** {question}\n**Answer:** {response}",
        color=discord.Color.purple()
    )

    await ctx.send(embed=embed)

# ===== WELCOME SYSTEM =====
@bot.event
async def on_member_join(member):
    channel = bot.get_channel(1496836534815686836)

    if not channel:
        print("❌ Channel not found")
        return

    embed = discord.Embed(
        title="🔥 Welcome to 𝘾𝙅 & 𝙍𝘾𝙎 𝙘𝙧𝙖𝙘𝙠 { }",
        description=(
            f"✨ Welcome {member.mention}!\n\n"
            f"You joined **{member.guild.name}** successfully\n\n"
            f"🔹 Read the rules\n"
            f"🔹 Pick your roles\n"
            f"🔹 Enjoy the community\n\n"
            f"🎉 Have fun and make new friends!"
        ),
        color=discord.Color.green()
    )

    embed.set_image(url="https://media.discordapp.net/attachments/1480969775344652470/1496647110525845625/DF7E4FDA-66D3-49FF-BD5E-7C746253AE2D.png")

    embed.set_footer(
        text=f"Member #{len(member.guild.members)} • Welcome!"
    )

    await channel.send(embed=embed)

# ===== RUN BOT (FROM ENV) =====
bot.run(os.getenv("BOT_TOKEN"))
