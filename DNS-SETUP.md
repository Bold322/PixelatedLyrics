# Quick DNS Setup Guide

## Railway DNS Setup (Step-by-Step)

### 1. Get Your Railway Domain

1. Go to Railway dashboard → Your project → Settings
2. Under **Domains**, click **"Generate Domain"**
3. You'll get something like: `your-app.up.railway.app`

### 2. Add Custom Domain (Optional)

1. In Railway Settings → Domains
2. Click **"Custom Domain"**
3. Enter your domain (e.g., `app.yourdomain.com`)
4. Railway will show you the DNS record to add

### 3. Configure DNS at Your Provider

**Example for `app.yourdomain.com`:**

| Provider       | Record Type | Name | Value                     |
| -------------- | ----------- | ---- | ------------------------- |
| Cloudflare     | CNAME       | app  | `your-app.up.railway.app` |
| Namecheap      | CNAME       | app  | `your-app.up.railway.app` |
| GoDaddy        | CNAME       | app  | `your-app.up.railway.app` |
| Google Domains | CNAME       | app  | `your-app.up.railway.app` |

### 4. Wait for Propagation

- Usually takes 5-30 minutes
- Check with: `nslookup app.yourdomain.com`
- Or visit: [whatsmydns.net](https://www.whatsmydns.net)

### 5. Verify

- Railway will automatically provision SSL
- Once DNS propagates, your domain should work with HTTPS

---

## Common DNS Record Types

### CNAME Record

- **Use for:** Subdomains (e.g., `app.yourdomain.com`)
- **Points to:** Another domain name
- **Example:** `app` → `your-app.up.railway.app`

### A Record

- **Use for:** Root domain (e.g., `yourdomain.com`)
- **Points to:** IP address
- **Example:** `@` → `192.0.2.1`

### AAAA Record

- **Use for:** IPv6 addresses
- **Points to:** IPv6 address

---

## Troubleshooting

### DNS Not Working?

1. **Check TTL:** Lower TTL (300-600 seconds) for faster updates
2. **Verify Record:** Make sure the CNAME value matches exactly
3. **Wait Longer:** DNS can take up to 48 hours (usually much faster)
4. **Clear Cache:**
   - macOS: `sudo dscacheutil -flushcache`
   - Windows: `ipconfig /flushdns`
   - Linux: `sudo systemd-resolve --flush-caches`

### SSL Certificate Issues?

- Most platforms auto-provision SSL
- Wait for DNS to fully propagate first
- Check platform logs for certificate errors

### Subdomain vs Root Domain?

- **Subdomain** (`app.yourdomain.com`): Easier, faster setup, use CNAME
- **Root domain** (`yourdomain.com`): May require A record, some platforms support CNAME flattening

---

## Quick Commands

```bash
# Check DNS resolution
nslookup app.yourdomain.com
dig app.yourdomain.com

# Check if domain points to Railway
curl -I https://app.yourdomain.com

# Test SSL certificate
openssl s_client -connect app.yourdomain.com:443 -servername app.yourdomain.com
```
