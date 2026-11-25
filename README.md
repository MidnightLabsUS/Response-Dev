# SmartBoot Response

SmartBoot Response is a Discord-connected alerting and phone notification service for SmartBoot systems.

Built by **Midnight Labs**.

## Features

- Phone registration and verification
- Automated voice alerts through Asterisk
- SIP provider authentication
- Local text-to-speech with Piper
- Account management and alert forwarding
- Configurable TTS voices
- HTTP API and WebSocket integrations

## Requirements

- Docker Engine and Docker Compose
- A Discord application and bot token
- A SIP provider with outbound SIP support
- Valid SIP authentication credentials
- A public server IP for SIP/RTP

Asterisk is included as the SIP backend. SmartBoot connects to Asterisk through AMI, while Asterisk handles SIP signaling, RTP, authentication, NAT and the outbound call.

## Quick start

```bash
git clone -b response-no-pbx https://github.com/MidnightLabsUS/Response-Dev.git
cd Response-Dev
cp .env.example .env
```

Edit `.env`:

```env
DISCORD_TOKEN=

SIP_SERVER=sip.nwipbx.com
SIP_SERVER_PORT=5060
SIP_DOMAIN=sip.nwipbx.com
SIP_USERNAME=
SIP_AUTH_USERNAME=
SIP_PASSWORD=
SIP_CALLER_ID=
SIP_ADVERTISED_IP=

ASTERISK_AMI_HOST=asterisk
ASTERISK_AMI_PORT=5038
ASTERISK_AMI_USER=smartboot
ASTERISK_AMI_PASSWORD=
```

`SIP_ADVERTISED_IP` must be the public IP of the VPS. Do not use the Docker container IP.

Start:

```bash
docker compose up -d --build
```

## SIP

Asterisk uses PJSIP for the provider trunk. The provider credentials are supplied through the main `.env` file. RTP uses UDP ports 10000-10100.

The call flow is:

```
Discord
  ↓
SmartBoot Response
  ↓
Asterisk AMI
  ↓
Asterisk PJSIP
  ↓
SIP provider
  ↓
Phone
```

Asterisk handles the SIP/RTP NAT boundary, so SmartBoot no longer sends SIP or RTP directly.

## Operations

```bash
docker compose logs -f
docker compose logs -f asterisk
docker compose restart
docker compose up -d --build
docker compose down
```

Do not run `docker compose down -v` unless you intend to delete the persistent database and call audio volume.

## Security

- Never commit `.env`, Discord tokens or SIP/AMI credentials.
- Keep UDP 5060 and the RTP range restricted to the SIP provider when possible.
- Do not expose AMI port 5038 publicly.
- Use dedicated SIP credentials for SmartBoot.

## License

GNU General Public License v3.0 or later. See [LICENSE](LICENSE).
