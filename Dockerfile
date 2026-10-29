FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY public ./public
ENV PORT=3056 NODE_ENV=production
EXPOSE 3056
USER node
CMD ["node", "src/server.js"]
