FROM node:20-alpine

# Install curl and wget for healthchecks
RUN apk add --no-cache curl wget bash

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application source code and SQL scripts
COPY . .

# Ensure run-tests.sh is executable
RUN chmod +x run-tests.sh

EXPOSE 3000

CMD ["node", "src/index.js"]
