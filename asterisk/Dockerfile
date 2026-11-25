FROM andrius/asterisk:stable
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 5060/udp 5038 10000-10100/udp
ENTRYPOINT ["/entrypoint.sh"]