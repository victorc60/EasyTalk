FROM node:22-bookworm-slim

WORKDIR /app

# Install production dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy the rest of the source
COPY . .

ENV NODE_ENV=production

CMD ["npm", "start"]
