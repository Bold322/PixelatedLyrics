# Deployment Guide

This guide explains how to deploy MrLyrics to free hosting platforms.

## Supported Platforms

### 1. Railway (Recommended)

Railway offers a free tier with $5 credit per month and supports Docker deployments.

**Steps:**
1. Go to [railway.app](https://railway.app) and sign up
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your repository
4. Railway will automatically detect the `Dockerfile` and `railway.json`
5. The app will build and deploy automatically
6. Railway will provide a public URL

**Environment Variables:**
- `PORT` - Automatically set by Railway (no action needed)

**Note:** Railway free tier includes $5 credit per month. After that, you'll need to add a payment method or the service will pause.

---

### 2. Render

Render offers a free tier with some limitations.

**Steps:**
1. Go to [render.com](https://render.com) and sign up
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Render will detect the `render.yaml` file
5. Configure:
   - **Name:** mrlyrics (or your preferred name)
   - **Environment:** Node
   - **Build Command:** `pnpm install && pnpm run build`
   - **Start Command:** `pnpm start`
6. Click "Create Web Service"

**Note:** Render free tier:
- Services spin down after 15 minutes of inactivity
- First request after spin-down may take 30-60 seconds
- Limited to 750 hours/month

---

### 3. Fly.io

Fly.io offers a free tier with generous limits.

**Steps:**
1. Install Fly CLI: `curl -L https://fly.io/install.sh | sh`
2. Sign up: `fly auth signup`
3. Initialize: `fly launch` (in your project directory)
4. Deploy: `fly deploy`

**Note:** You may need to create a `fly.toml` file. Fly.io will guide you through this.

---

## Docker Deployment (Universal)

If you want to deploy to any Docker-compatible platform:

1. Build the image:
```bash
docker build -t mrlyrics .
```

2. Run the container:
```bash
docker run -p 3000:3000 mrlyrics
```

---

## Important Notes

### System Dependencies
This application requires:
- **FFmpeg** - For video processing
- **yt-dlp** - For downloading YouTube content
- **Canvas native dependencies** - For image generation

All of these are included in the Dockerfile, so Docker deployments will work automatically.

### Environment Variables
- `PORT` - Server port (defaults to 3000 if not set)
- `NODE_ENV` - Set to `production` for production deployments

### Storage Considerations
- Generated videos are stored in the `output/` directory
- On free tiers, this storage is ephemeral (lost on restart)
- Consider using cloud storage (S3, Cloudinary, etc.) for persistent storage

### Resource Limits
Free tiers typically have:
- Limited CPU and memory
- Limited storage
- Request timeouts (usually 30-60 seconds)
- Rate limiting

For video generation, you may need to:
- Use a queue system for long-running tasks
- Stream results instead of waiting for completion
- Use external storage for large files

---

## Troubleshooting

### Build Fails
- Check that all dependencies are in `package.json`
- Ensure `tsconfig.json` exists and is valid
- Check platform logs for specific errors

### FFmpeg Not Found
- The Dockerfile includes FFmpeg installation
- If deploying without Docker, ensure FFmpeg is installed on the host

### Canvas Build Errors
- Canvas requires native dependencies (included in Dockerfile)
- On non-Docker deployments, install system packages:
  - macOS: `brew install cairo pango libpng jpeg giflib`
  - Linux: `apt-get install libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev`

### Port Issues
- Ensure the server uses `process.env.PORT` (already configured)
- Check platform-specific port requirements

---

## Next Steps

After deployment:
1. Test the API endpoints
2. Monitor logs for errors
3. Set up custom domain (if supported by platform)
4. Consider adding persistent storage for generated videos
5. Implement rate limiting if needed

