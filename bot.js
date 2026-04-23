const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const canvacord = require('canvacord');
const { loadImage } = require('canvas');

// Load dotenv only for local development
if (process.env.NODE_ENV !== 'production') {
    try {
        require('dotenv').config();
    } catch (error) {}
}

// Environment variables
const BOT_TOKEN = process.env.BOT_TOKEN;
const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID;

// Validation
if (!BOT_TOKEN) {
    console.error('❌ BOT_TOKEN is missing!');
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
        GatewayIntentBits.GuildMembers
    ]
});

// ========== WELCOME IMAGE GENERATOR ==========
async function generateWelcomeImage(member) {
    try {
        // Get user avatar URL
        const avatar = member.user.displayAvatarURL({ extension: 'png', size: 256 });
        
        // Create welcome image using Canvacord
        const welcomeImage = await canvacord.Welcomer()
            .setUsername(member.user.username)
            .setDiscriminator(member.user.discriminator)
            .setAvatar(avatar)
            .setColor("border", "#ff0000")
            .setColor("username-box", "#2d0000")
            .setColor("discriminator-box", "#2d0000")
            .setColor("message-box", "#1a0000")
            .setColor("title", "#ff3333")
            .setBackground("https://media.discordapp.net/attachments/1480969775344652470/1496647110525845625/DF7E4FDA-66D3-49FF-BD5E-7C746253AE2D.png")
            .setMemberCount(member.guild.memberCount)
            .setText("title", "WELCOME")
            .setText("message", `Welcome to ${member.guild.name}`)
            .setText("member-count", `Member #${member.guild.memberCount}`);
        
        // Return the image buffer
        return await welcomeImage.build();
        
    } catch (error) {
        console.error('Welcome image generation error:', error);
        return null;
    }
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
                .setColor(0xff0000)
                .setTitle(`🎉 Welcome to ${member.guild.name}! 🎉`)
                .setDescription(
                    `Welcome ${member.toString()}!\n` +
                    `You joined the server successfully!\n\n` +
                    `• Read the rules\n` +
                    `• Pick your roles\n` +
                    `• Enjoy the community\n\n` +
                    `Have fun and make new friends 🎉`
                )
                .setImage("https://media.discordapp.net/attachments/1480969775344652470/1496647110525845625/DF7E4FDA-66D3-49FF-BD5E-7C746253AE2D.png")
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
                `📖 Please read the rules\n` +
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

// ========== READY EVENT ==========
client.once('ready', () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    console.log(`👋 Welcome channel: ${WELCOME_CHANNEL_ID}`);
    console.log(`🚀 Bot is ready!`);
});

// ========== ERROR HANDLING ==========
process.on('unhandledRejection', (error) => {
    console.error('❌ Unhandled promise rejection:', error);
});

process.on('error', (error) => {
    console.error('❌ Error:', error);
});

// ========== START BOT ==========
client.login(BOT_TOKEN);
