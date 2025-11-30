# Use Node.js 20 LTS
FROM node:20-slim

# Install system dependencies for FFmpeg, yt-dlp, and canvas
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip \
    wget \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    && pip3 install yt-dlp \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install pnpm if not available
RUN npm install -g pnpm

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build TypeScript
RUN pnpm run build

# Create necessary directories
RUN mkdir -p output temp temp_subs

# Expose port
EXPOSE 3000

# Start the server
CMD ["pnpm", "start"]

