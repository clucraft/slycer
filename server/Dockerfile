FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

RUN mkdir -p uploads output

EXPOSE 3001
CMD ["node", "dist/index.js"]
