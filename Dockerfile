FROM node:20-noble

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg openssh-client python3 python3-venv python3-setuptools build-essential && rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/piper && /opt/piper/bin/pip install --no-cache-dir piper-tts

WORKDIR /app/models
RUN /opt/piper/bin/python -m piper.download_voices en_US-lessac-medium

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .

RUN mkdir -p /app/data

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm","start"]