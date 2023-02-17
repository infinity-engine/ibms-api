FROM node:14-slim
WORKDIR /app
COPY package.json /app
RUN npm install
COPY .  /app
EXPOSE 8080
CMD ["npm","start"]