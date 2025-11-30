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

## DNS Configuration (Custom Domain)

### Railway

Railway provides a free `.railway.app` subdomain, but you can also add a custom domain.

**Steps:**

1. Go to your Railway project dashboard
2. Click on your service
3. Go to the **Settings** tab
4. Scroll to **Domains** section
5. Click **"Generate Domain"** to get a Railway subdomain (e.g., `your-app.up.railway.app`)
6. For custom domain:
   - Click **"Custom Domain"**
   - Enter your domain (e.g., `mrlyrics.com` or `app.mrlyrics.com`)
   - Railway will provide DNS records to configure

**DNS Records for Railway:**

- **Type:** `CNAME`
- **Name:** `@` (for root domain) or `www` (for www subdomain) or your subdomain
- **Value:** Railway will provide this (e.g., `your-app.up.railway.app`)

**Note:** For root domains (apex domains), Railway uses CNAME flattening, so you can use a CNAME record even for the root domain.

---

### Render

**Steps:**

1. Go to your Render dashboard
2. Select your service
3. Go to **Settings** → **Custom Domains**
4. Click **"Add Custom Domain"**
5. Enter your domain name
6. Render will provide DNS records

**DNS Records for Render:**

- **Type:** `CNAME`
- **Name:** Your subdomain (e.g., `app` for `app.yourdomain.com`)
- **Value:** Render will provide (e.g., `your-service.onrender.com`)

**For Root Domain:**

- **Type:** `A` record
- **Name:** `@`
- **Value:** Render will provide the IP address

---

### Fly.io

**Steps:**

1. Run: `fly certs add yourdomain.com`
2. Fly.io will provide DNS records
3. Configure your DNS provider with the provided records

**DNS Records for Fly.io:**

- **Type:** `CNAME`
- **Name:** Your subdomain
- **Value:** Fly.io will provide (e.g., `your-app.fly.dev`)

---

## DNS Provider Instructions

### Cloudflare

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Select your domain
3. Go to **DNS** → **Records**
4. Click **"Add record"**
5. Configure:
   - **Type:** `CNAME` (or `A` for root domain if required)
   - **Name:** Your subdomain (e.g., `app` for `app.yourdomain.com`)
   - **Target:** The value provided by your hosting platform
   - **Proxy status:** Toggle off (gray cloud) for direct connection, or on (orange cloud) for Cloudflare proxy
6. Click **"Save"**

**Note:** Cloudflare proxy (orange cloud) may interfere with some services. Start with proxy off (gray cloud).

---

### Namecheap

1. Log in to [Namecheap](https://www.namecheap.com)
2. Go to **Domain List** → Select your domain → **Manage**
3. Go to **Advanced DNS** tab
4. Under **Host Records**, click **"Add New Record"**
5. Configure:
   - **Type:** `CNAME Record`
   - **Host:** Your subdomain (e.g., `app`)
   - **Value:** The value provided by your hosting platform
   - **TTL:** Automatic (or 300 seconds)
6. Click **"Save"**

---

### GoDaddy

1. Log in to [GoDaddy](https://www.godaddy.com)
2. Go to **My Products** → Select your domain → **DNS**
3. Scroll to **Records** section
4. Click **"Add"**
5. Configure:
   - **Type:** `CNAME`
   - **Name:** Your subdomain (e.g., `app`)
   - **Value:** The value provided by your hosting platform
   - **TTL:** 600 seconds (default)
6. Click **"Save"**

---

### Google Domains / Squarespace Domains

1. Log in to your domain registrar
2. Navigate to DNS settings
3. Add a new record:
   - **Type:** `CNAME`
   - **Name:** Your subdomain
   - **Data/Value:** The value provided by your hosting platform
4. Save the record

---

### Route 53 (AWS)

1. Log in to [AWS Console](https://console.aws.amazon.com)
2. Go to **Route 53** → **Hosted zones**
3. Select your domain
4. Click **"Create record"**
5. Configure:
   - **Record name:** Your subdomain
   - **Record type:** `CNAME`
   - **Value:** The value provided by your hosting platform
   - **TTL:** 300 seconds
6. Click **"Create records"**

---

## DNS Propagation

After configuring DNS records:

- **Propagation time:** Usually 5 minutes to 48 hours
- **Typical time:** 15-30 minutes for most providers
- **Check status:** Use tools like:
  - [whatsmydns.net](https://www.whatsmydns.net)
  - [dnschecker.org](https://dnschecker.org)
  - `dig yourdomain.com` or `nslookup yourdomain.com` in terminal

**Tips:**

- Use subdomains (e.g., `app.yourdomain.com`) instead of root domain for faster setup
- Lower TTL values (300-600 seconds) help with faster updates
- Clear your DNS cache: `sudo dscacheutil -flushcache` (macOS) or restart your router

---

## SSL/HTTPS

Most platforms (Railway, Render, Fly.io) automatically provision SSL certificates:

- **Railway:** Automatic SSL via Let's Encrypt
- **Render:** Automatic SSL certificates
- **Fly.io:** Run `fly certs add` to get automatic SSL

No additional configuration needed once DNS is properly set up!

---

## Next Steps

After deployment:

1. Test the API endpoints
2. Monitor logs for errors
3. Set up custom domain using the instructions above
4. Verify SSL certificate is active (should be automatic)
5. Consider adding persistent storage for generated videos
6. Implement rate limiting if needed
