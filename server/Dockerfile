FROM node:20-bookworm-slim

WORKDIR /app

COPY server/package*.json ./
RUN npm ci --omit=dev

COPY server/src ./src
RUN mkdir -p ./data

ENV PORT=38173
EXPOSE 38173

CMD ["npm", "start"]
