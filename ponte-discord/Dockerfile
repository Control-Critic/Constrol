# Ponte de voz Discord <-> Control Critic
FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY ponte.mjs social.mjs ./
ENV NODE_ENV=production
USER node
CMD ["node", "ponte.mjs"]
