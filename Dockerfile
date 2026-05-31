FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js .
COPY lib/ lib/
COPY middleware/ middleware/
COPY routes/ routes/
COPY public/ public/
EXPOSE 7341
CMD ["node", "server.js"]
