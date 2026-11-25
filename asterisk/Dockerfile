FROM debian:bookworm-slim
RUN apt-get update&&DEBIAN_FRONTEND=noninteractive apt-get install-y asterisk ca-certificates&&rm-rf /var/lib/apt/lists/*
COPY entrypoint.sh /entrypoint.sh
RUN chmod+x /entrypoint.sh
EXPOSE 5060/udp 5038 10000-10100/udp
ENTRYPOINT ["/entrypoint.sh"]