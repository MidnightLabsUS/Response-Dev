FROM node:20.20.2-trixie

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev

RUN apt-get update&&apt-get install -y --no-install-recommends ffmpeg openssh-client python3 python3-venv python3-setuptools&&rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/piper&&/opt/piper/bin/pip install --no-cache-dir piper-tts
RUN /opt/piper/bin/python -m piper.download_voices en_US-lessac-medium

COPY . .
RUN mkdir -p /app/data

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm","start"]
