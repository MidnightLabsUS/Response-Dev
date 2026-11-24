# SmartBoot Response

SmartBoot Response is a Discord-connected alerting and phone notification service for SmartBoot systems.

Built by **Midnight Labs**.

## Features

- Phone registration and verification
- Automated voice alerts through direct SIP
- SIP digest authentication
- Local text-to-speech with Piper
- Account management and alert forwarding
- Configurable TTS voices
- HTTP API and WebSocket integrations
- Demo alerts through a configured Discord webhook

## Requirements

- Docker Engine and Docker Compose
- A Discord application and bot token
- A SIP provider or SIP server that supports outbound calls
- Valid SIP authentication credentials
- Network access to the SIP server

## Quick start

Clone the response-no-pbx branch:

```bash
git clone -b response-no-pbx https://github.com/MidnightLabsUS/Response-Dev.git
cd Response-Dev
cp .env.example .env
```

Edit `.env` and configure the Discord and SIP settings:

```env
OUTBOUND_CALLERID=
USERNAME=
AUTHUSERNAME=
PASSWORD=
SIP_SERVER=
SIP_SERVER_PORT=
```

Then start the service:

```bash
docker compose up -d --build
```

The API listens on port `3000` inside the container. Configure your reverse proxy and HTTPS before exposing it publicly.

## Configuration

See [`.env.example`](.env.example) for all supported environment variables.

Important settings:

| Variable | Purpose |
|---|---|
| `DISCORD_TOKEN` | Discord bot token |
| `OUTBOUND_CALLERID` | Caller ID used for outbound calls |
| `USERNAME` | SIP username |
| `AUTHUSERNAME` | SIP authentication username |
| `PASSWORD` | SIP authentication password |
| `SIP_SERVER` | SIP server address |
| `SIP_SERVER_PORT` | SIP server port |
| `ADMIN_DISCORD_IDS` | Comma-separated administrator Discord user IDs |
| `ADMIN_ROLE_IDS` | Comma-separated administrator role IDs |

The phone numbers stored in SmartBoot Response are used as outbound SIP destinations.

## Discord commands

| Command | Description |
|---|---|
| `/setup` | Register a phone number |
| `/verify` | Verify a destination using the call code |
| `/resend-code` | Resend a verification call |
| `/cancel-setup` | Cancel a pending registration |
| `/accounts` | View registered accounts |
| `/update-account` | Change and re-verify a destination |
| `/remove-account` | Remove a registered account |
| `/link-account` | Forward alerts between accounts |
| `/unlink-account` | Remove an alert-forwarding link |
| `/account-links` | View forwarding links |
| `/set-voice` | Choose the alert voice |
| `/alerts` | View recent delivered alerts |
| `/admin` | View administrative statistics (admins only) |
| `/lookup` | Search accounts (admins only) |
| `/status` | Check service connectivity |

## API

| Endpoint | Purpose |
|---|---|
| `GET /api/healthcheck` | Health check |
| `POST /api/v1/alert` | Submit an alert |
| `POST /api/v1/webhook/:brand/:accountNumber` | Submit a brand-specific alert |
| `POST /api/v1/tts` | Request a text-to-speech phone message |
| `/api/v1/websocket/:accountNumber` | WebSocket connection |

Use HTTPS through a reverse proxy for public API access. Keep SIP credentials private and restrict access to trusted networks.

## Data and operations

SQLite data is stored in the persistent `smartboot-data` Docker volume.

```bash
docker compose logs -f
docker compose restart smartboot-discordbot
docker compose up -d --build
docker compose down
```

**Do not run `docker compose down -v` unless you intend to delete the persistent database volume.**

## Security

- Never commit `.env`, tokens, webhook URLs, SIP credentials, or private keys.
- Keep SIP credentials private.
- Use dedicated SIP credentials for the application.
- Restrict SIP access when supported by your provider.
- Back up the persistent database volume.
- Review your configuration before exposing the API.

## Contributing

Issues and pull requests are welcome. Please avoid including real phone numbers, account identifiers, credentials, webhook URLs, or other private information in issues and logs.

## License

GNU General Public License v3.0 or later. See [LICENSE](LICENSE).
