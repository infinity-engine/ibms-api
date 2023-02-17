FROM alpine:3.16

ENV NODE_VERSION 18.14.1

WORKDIR /app
COPY package.json /app
RUN npm install
COPY .  /app
EXPOSE 8080