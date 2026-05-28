# Deploy SynexorAI — Get a Shareable Link

## Option 1: Render.com (Recommended — Free, Easiest)

### Step 1: Push to GitHub
```bash
# In your project folder
git init
git add .
git commit -m "SynexorAI TMS - ready for deployment"

# Create repo on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/synexorai.git
git branch -M main
git push -u origin main
```

### Step 2: Deploy on Render
1. Go to [render.com](https://render.com) and sign up (free)
2. Click **New** → **Web Service**
3. Connect your GitHub repo
4. Render will auto-detect the `render.yaml` — click **Deploy**
5. Wait ~3 minutes for build
6. Your app is live at: `https://synexorai.onrender.com`

Share that URL with anyone!

---

## Option 2: Railway.app (Also Free)

1. Go to [railway.app](https://railway.app) and sign in with GitHub
2. Click **New Project** → **Deploy from GitHub repo**
3. Select your repo
4. Railway auto-detects the Dockerfile
5. Live in ~2 minutes

---

## Option 3: Run Locally with Docker

```bash
docker build -t synexorai .
docker run -p 3001:3001 synexorai
```
Open `http://localhost:3001` — full app running.

---

## Demo Login Credentials
- **Admin (full access):** admin / admin123
- **Viewer (read-only):** viewer / viewer123
