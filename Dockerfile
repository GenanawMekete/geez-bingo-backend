FROM node:18-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy source code
COPY . .

# Create uploads directory
RUN mkdir -p uploads logs

# Set permissions
RUN chown -R node:node /app

USER node

EXPOSE 5000

CMD ["node", "src/App.js"]
