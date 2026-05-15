# Discord Bot with Web Dashboard

## 🚀 Quick Deploy to Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template)

## 📋 Setup Instructions

### 1. Create Discord Application
1. Go to https://discord.com/developers/applications
2. Click "New Application" → Name it
3. Go to "Bot" → "Add Bot" → Copy `BOT_TOKEN`
4. Go to "OAuth2" → "General" → Copy `CLIENT_ID` and `CLIENT_SECRET`
5. Add Redirect URL: `https://your-app.railway.app/auth/discord/callback`
6. Bot Scopes: `bot` + `identify` + `guilds`
7. Bot Permissions: `Administrator`

### 2. Setup MongoDB Atlas (FREE)
1. Go to https://mongodb.com/atlas
2. Create FREE cluster
3. Get connection string (MONGODB_URI)

### 3. Deploy to Railway
1. Fork this repo or use the Deploy button
2. Add environment variables in Railway dashboard
3. Deploy!

### 4. Environment Variables
| Variable | Description |
|----------|-------------|
| BOT_TOKEN | Your Discord bot token |
| CLIENT_ID | Discord application ID |
| CLIENT_SECRET | Discord client secret |
| SESSION_SECRET | Random string for sessions |
| MONGODB_URI | MongoDB connection string |
| DASHBOARD_URL | Your Railway app URL |
| PORT | 3000 (default) |

## 🎮 Commands

### Moderation
- `!ban <user_id> [reason]`
- `!kick <user_id> [reason]`
- `!mute <user_id> <time> [reason]`
- `!unmute <user_id>`
- `!clear <1-100>`
- `!lock` / `!unlock`

### Info
- `!help` - Show all commands
- `!serverinfo` - Server statistics
- `!userinfo [user_id]` - User information

### Fun
- `!freegame` - Start free game announcements
- `!stopfreegame` - Stop announcements
- `!suggest <message>` - Submit suggestion
- `!giveaway <prize> <minutes> <winners>` - Start giveaway

## 🔧 Dashboard Features
- Discord OAuth2 Login
- Manage multiple servers
- Toggle Anti-Link system
- Configure Welcome messages
- Setup Auto Role
- Voice channel auto-join
- View server logs
- Change bot prefix

## 🐛 Troubleshooting

### Bot not responding?
- Check bot has required permissions
- Verify BOT_TOKEN is correct

### Dashboard login fails?
- Check CLIENT_ID and CLIENT_SECRET
- Verify CALLBACK_URL matches exactly

### MongoDB connection error?
- Check IP whitelist (0.0.0.0/0)
- Verify username/password

## 📝 License
MIT
