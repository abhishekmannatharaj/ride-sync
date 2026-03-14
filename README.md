# RideSync 🚴

Real-time group ride tracker with synced YouTube music.

## Features
- Live GPS tracking of all riders on a shared map
- Synced YouTube music — leader controls, everyone hears it together
- Screen wake lock — phones stay awake during the ride
- Mobile-responsive dark UI
- First rider to join becomes the leader automatically

## Local dev

```bash
npm install
npm start
# Open http://localhost:3000
```

## Deploy to Render (free)

1. Push to GitHub:
```bash
git init
git add .
git commit -m "ride app ready"
# Create repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/ride-app.git
git push -u origin main
```

2. Go to [render.com](https://render.com) → New → Web Service
3. Connect your GitHub repo
4. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
5. Deploy → get your `https://ride-app-xyz.onrender.com` URL

## How it works

- **First person** to join is the leader (⭐)
- Leader loads a YouTube URL and controls play/pause
- All followers hear the music in sync
- Leader can pass the role to anyone else
- GPS updates every 2 seconds to all riders

## HTTPS note
GPS requires HTTPS — Render provides this automatically on all deployments.
