# Discord Moderation Bot

A simple but powerful Discord bot with timeout-based mute system.

## Commands (12 total)

**Moderation (7)**: ban, kick, mute, unmute, timeout, clear, warn
**Utility (5)**: avatar, serverinfo, userinfo, ping, help

## Setup

1. Install Node.js 18+
2. Run `npm install`
3. Add environment variables
4. Run `npm start`

## Environment Variables (Required)

- `BOT_TOKEN` - Your Discord bot token
- `LOG_CHANNEL_ID` - Channel ID for logs
- `MOD_ROLE_ID` - Role ID that can use moderation commands

## Railway Deployment

1. Push code to GitHub
2. On Railway: New Project → Deploy from GitHub
3. Add environment variables in Variables tab
4. Deploy automatically!

## Bot Permissions Needed

- Ban Members
- Kick Members
- Moderate Members
- Manage Messages
- Send Messages
- Embed Links
- Read Messages
- View Channels

## Features

✅ Timeout-based mute system (Discord native)
✅ Permission checks for each command
✅ Full logging system
✅ Clean help panel
✅ No hardcoded values
✅ Commands work in any channel
✅ Ready for Railway
