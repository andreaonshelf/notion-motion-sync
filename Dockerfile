FROM node:18-alpine

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++ 

WORKDIR /app

COPY package*.json ./
# Use npm install to ensure native modules are built
RUN npm install --production

COPY . .

EXPOSE 3000

CMD ["node", "src/index.js"]