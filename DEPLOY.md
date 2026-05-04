# 🚀 SokoLeo — Deploy to Render.com

## What You Need Before Starting
- A GitHub account (free) → https://github.com
- A Render account (free) → https://render.com
- Your Neon DATABASE_URL (you already have this)

---

## STEP 1 — Create a GitHub Repository

1. Go to https://github.com and log in
2. Click the **"+"** button (top right) → **"New repository"**
3. Settings:
   - Repository name: `sokoleo`
   - Set to **Private**
   - Do NOT tick "Add README"
4. Click **"Create repository"**
5. GitHub will show you a page with commands — **keep this page open**

---

## STEP 2 — Push Your Code to GitHub

Open a terminal in your sokoleo folder:
```
cd C:\Users\User\OneDrive\Documents\sokoleo
```

Run these commands **one at a time**:

```
git init
```
```
git add .
```
```
git commit -m "SokoLeo v1.0 - Initial deployment"
```
```
git branch -M main
```

Now copy the command from your GitHub page that looks like this
(it will have YOUR username in it):
```
git remote add origin https://github.com/YOUR_USERNAME/sokoleo.git
```
```
git push -u origin main
```

When it asks for username and password:
- Username: your GitHub username
- Password: use a **Personal Access Token** (not your GitHub password)
  → Go to GitHub → Settings → Developer Settings → Personal Access Tokens → Tokens (classic) → Generate new token → tick "repo" → copy the token → paste as password

---

## STEP 3 — Deploy on Render

1. Go to https://render.com and sign up/log in
2. Click **"New +"** → **"Web Service"**
3. Click **"Connect a repository"** → connect your GitHub account
4. Select your **sokoleo** repository
5. Render will auto-detect the settings from `render.yaml`

   Verify these settings:
   - **Name:** sokoleo
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node src/server.js`
   - **Plan:** Free

6. Click **"Advanced"** → **"Add Environment Variable"**

   Add this variable:
   | Key | Value |
   |-----|-------|
   | `DATABASE_URL` | `postgresql://...` (your full Neon connection string) |

   ⚠️ Get your Neon URL from: https://console.neon.tech
   → Your project → Connection Details → Copy the connection string
   → It looks like: `postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require`

7. Click **"Create Web Service"**

---

## STEP 4 — Wait for Deployment

Render will:
1. Pull your code from GitHub (~30 seconds)
2. Run `npm install` (~1-2 minutes)
3. Start `node src/server.js`

You'll see logs streaming. When you see:
```
SokoLeo backend running on port 10000
```
Your app is live! 🎉

---

## STEP 5 — Your Live URL

Render gives you a URL like:
```
https://sokoleo.onrender.com
```

Test these pages:
- `https://sokoleo.onrender.com/farmer.html`
- `https://sokoleo.onrender.com/trader.html`
- `https://sokoleo.onrender.com/farm-services.html`

---

## STEP 6 — Run Migrations on Live Database

Your Neon database on the cloud already has your local data.
If you need to run migrations on the live DB, just run locally:
```
node migrate-livestock.js
node migrate-dual-role.js
```
These connect to the same Neon cloud database, so they work for both local and live.

---

## ⚠️ Important Notes

**Free Render Plan Limitations:**
- App sleeps after 15 minutes of inactivity
- Takes ~30 seconds to "wake up" on first visit
- 750 free hours/month (enough for testing)
- Upgrade to Starter ($7/month) for always-on

**Custom Domain (Optional):**
If you want `www.sokoleo.co.ke` instead of `sokoleo.onrender.com`:
1. Buy domain from Kenya Network Information Centre (KeNIC) or Truehost
2. In Render: Settings → Custom Domain → Add domain
3. Update your DNS records as Render instructs

**Auto-Deploy:**
Every time you push new code to GitHub, Render automatically redeploys!
```
git add .
git commit -m "Update: new feature"
git push
```
Render will pick it up in ~2 minutes. 🚀

---

## Troubleshooting

**Error: Cannot find module**
→ Check that all your `require()` paths are correct

**Error: Connection refused (database)**
→ Make sure DATABASE_URL is set correctly in Render environment variables
→ Make sure your Neon database allows connections from all IPs

**App loads but shows blank page**
→ Check the browser console (F12) for errors
→ Check Render logs for server errors

**Need help?**
→ Share the Render log screenshot with your developer
