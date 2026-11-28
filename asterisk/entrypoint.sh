#!/bin/sh
set -eu
mkdir -p /var/lib/asterisk/sounds/custom/calls
cat >/etc/asterisk/pjsip.conf <<EOF
[transport-udp]
type=transport
protocol=udp
bind=0.0.0.0:5060
local_net=172.16.0.0/12
local_net=192.168.0.0/16
local_net=127.0.0.0/8
external_signaling_address=${SIP_ADVERTISED_IP}
external_media_address=${SIP_ADVERTISED_IP}

[provider-auth]
type=auth
auth_type=userpass
username=${SIP_AUTH_USERNAME:-$SIP_USERNAME}
password=${SIP_PASSWORD}

[provider]
type=endpoint
transport=transport-udp
context=smartboot-outbound
disallow=all
allow=ulaw
aors=provider
outbound_auth=provider-auth
from_user=${SIP_USERNAME}
from_domain=${SIP_DOMAIN:-$SIP_SERVER}
callerid=${SIP_CALLER_ID}
direct_media=no
rtp_symmetric=yes
force_rport=yes
identify_by=ip

[provider]
type=aor
contact=sip:${SIP_SERVER}:${SIP_SERVER_PORT:-5060}

[provider-identify]
type=identify
endpoint=provider
match=${SIP_SERVER}/32

[provider-reg]
type=registration
transport=transport-udp
outbound_auth=provider-auth
server_uri=sip:${SIP_SERVER}:${SIP_SERVER_PORT:-5060}
client_uri=sip:${SIP_USERNAME}@${SIP_DOMAIN:-$SIP_SERVER}
contact_user=${SIP_USERNAME}
retry_interval=60
EOF
if [ -n "${SIP_BACKUP_SERVER:-}" ];then
cat >>/etc/asterisk/pjsip.conf <<EOF

[provider2-auth]
type=auth
auth_type=userpass
username=${SIP_BACKUP_AUTH_USERNAME:-$SIP_BACKUP_USERNAME}
password=${SIP_BACKUP_PASSWORD}

[provider2]
type=endpoint
transport=transport-udp
context=smartboot-outbound
disallow=all
allow=ulaw
aors=provider2
outbound_auth=provider2-auth
from_user=${SIP_BACKUP_USERNAME}
from_domain=${SIP_BACKUP_DOMAIN:-$SIP_BACKUP_SERVER}
callerid=${SIP_BACKUP_CALLER_ID:-$SIP_CALLER_ID}
direct_media=no
rtp_symmetric=yes
force_rport=yes
identify_by=ip

[provider2]
type=aor
contact=sip:${SIP_BACKUP_SERVER}:${SIP_BACKUP_SERVER_PORT:-5060}

[provider2-identify]
type=identify
endpoint=provider2
match=${SIP_BACKUP_IDENTIFY_IP:-$SIP_BACKUP_SERVER}/32

[provider2-reg]
type=registration
transport=transport-udp
outbound_auth=provider2-auth
server_uri=sip:${SIP_BACKUP_SERVER}:${SIP_BACKUP_SERVER_PORT:-5060}
client_uri=sip:${SIP_BACKUP_USERNAME}@${SIP_BACKUP_DOMAIN:-$SIP_BACKUP_SERVER}
contact_user=${SIP_BACKUP_USERNAME}
retry_interval=60
EOF
fi
cat >/etc/asterisk/extensions.conf <<'EOF'
[smartboot-outbound]
exten => _X.,1,NoOp(SmartBoot call to ${EXTEN})
 same => n,Set(GROUP(smartboot)=${EXTEN})
 same => n,GotoIf($[${GROUP_COUNT(${EXTEN}@smartboot)}>1]?duplicate)
 same => n,Set(__ALERT_FILE=${ALERT_FILE})
 same => n,Dial(PJSIP/${EXTEN}@provider2,30,U(smartboot-ivr^s^1))
 same => n,Hangup()
 same => n(duplicate),NoOp(Duplicate call blocked for ${EXTEN})
 same => n,Hangup()

[smartboot-ivr]
exten => s,1,NoOp(Answered call)
 same => n,Read(KEY,custom/${ALERT_FILE},1,,3,10)
 same => n,GotoIf($["${KEY}"="1"]?confirmed)
 same => n,Hangup()
 same => n(confirmed),NoOp(User pressed 1)
 same => n,Return()
EOF
cat >/etc/asterisk/manager.conf <<EOF
[general]
enabled=yes
port=5038
bindaddr=0.0.0.0

[${ASTERISK_AMI_USER:-smartboot}]
secret=${ASTERISK_AMI_PASSWORD}
read=system,call,log,verbose,command,agent,user,config,dtmf,reporting,cdr,dialplan
write=system,call,originate,log,verbose,command,agent,user,config,dtmf,reporting,cdr,dialplan
permit=172.16.0.0/12
permit=192.168.0.0/16
permit=127.0.0.0/8
EOF
cat >/etc/asterisk/rtp.conf <<EOF
[general]
rtpstart=10000
rtpend=10100
EOF
exec asterisk -f -U asterisk -G asterisk
