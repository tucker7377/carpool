FROM node:24-alpine
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server.js storage.js ./
COPY public ./public
USER node
EXPOSE 8080
CMD [ "node", "server.js" ]
