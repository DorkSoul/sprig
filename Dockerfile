FROM --platform=$BUILDPLATFORM node:20-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev

FROM node:20-alpine
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY server.js .
COPY lib/ lib/
COPY middleware/ middleware/
COPY routes/ routes/
COPY public/ public/
EXPOSE 7341
CMD ["node", "server.js"]
