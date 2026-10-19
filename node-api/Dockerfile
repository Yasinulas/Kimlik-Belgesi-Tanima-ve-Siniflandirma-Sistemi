FROM node:20-slim

WORKDIR /app

# onnxruntime-node'un CPU execution provider'ı OpenMP (libgomp) ister
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3000
CMD ["node", "src/server.js"]
