# Use Node.js 20 LTS
FROM node:20-slim

# Install system dependencies for FFmpeg, yt-dlp, canvas, and fonts
RUN apt-get update && apt-get install -y \
    ffmpeg \
    wget \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    fontconfig \
    && wget -qO /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy font files to both system location and app directory
COPY fonts/ /usr/share/fonts/truetype/pixelify/
RUN fc-cache -f -v

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install dependencies using npm (better native module support than pnpm)
# npm will work fine even with pnpm-lock.yaml present
RUN npm install

# Ensure canvas native module is built
RUN npm rebuild canvas

# Copy source code (includes fonts directory)
COPY . .

# Build TypeScript
RUN npm run build

# Create necessary directories
RUN mkdir -p output temp temp_subs

# Expose port
EXPOSE 3000

# Start the server
CMD ["npm", "start"]

