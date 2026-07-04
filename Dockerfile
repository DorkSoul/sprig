FROM --platform=$BUILDPLATFORM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-alpine
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY server.js .
COPY lib/ lib/
COPY middleware/ middleware/
COPY routes/ routes/
COPY public/ public/
# Create the writable data dir owned by the unprivileged runtime user.
RUN mkdir -p /app/data/sessions && chown -R node:node /app/data
USER node
EXPOSE 7341
CMD ["node", "server.js"]
