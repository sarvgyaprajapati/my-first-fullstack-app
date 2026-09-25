# Setup — Windows + VS Code

## 0. Pehle se चाहिए
```
node -v
npm -v
```
Agar na chale to https://nodejs.org se LTS install karo.

## 1. Install
```powershell
cd video-backend
npm install
```

## 2. .env banao
```powershell
copy .env.example .env
```
`.env` khol kar bharo:
- Cloudinary ki teeno values (video upload ke liye — cloudinary.com par free account)
- `JWT_SECRET` — ek random secret string. Generate karne ke liye:
  ```powershell
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
  Jo output aaye wahi paste kar do.
- `OWNER_NAME`, `OWNER_EMAIL`, `OWNER_PASSWORD` — apna owner login (sirf aapko pata hoga)

## 3. Owner account banao (sirf ek baar)
```powershell
node seed-owner.js
```
Ye aapke `.env` ke OWNER_EMAIL/OWNER_PASSWORD se ek owner account database me bana dega.
**Future me naya owner chahiye ho** to `.env` me OWNER_* values badal kar isko dobara chalao.

## 4. Server start karo
```powershell
npm start
```
`http://localhost:5000/api/health` khol kar check karo — `{"status":"ok"}` dikhna chahiye.

## 5. Frontend pages kholo (browser me)

Seedhe file kholo (double-click) ya VS Code ke "Live Server" extension se:
- `public/intro.html` — animated site-name screen, sirf owner ko edit button dikhega
- `public/login.html` — User tab (signup/login) aur Owner tab (fixed secret login)
- `public/feed.html` — login ke baad; sirf owner ko post-box dikhega, sabko reaction buttons

**Flow test karne ke liye:**
1. `intro.html` kholo → 2.5 second baad `login.html` par chala jayega
2. "Owner" tab me `.env` wale OWNER_EMAIL/OWNER_PASSWORD se login karo → `feed.html` khulega jahan post likh sakte ho
3. Ek naye browser tab (ya incognito) me "User" tab se signup karo → wahi post dikhega, sirf reaction buttons milenge (post karne ka option nahi)
4. `intro.html` par wapas jao (owner wale tab me login rehte hue) → naam edit karke save karo, phir user wale tab me refresh karke check karo ki naam badal gaya

## Files
- `server.js` — saari APIs (auth, site-settings, posts, reactions, video upload)
- `db.js` — SQLite schema (users, site_settings, posts, reactions, videos)
- `middleware/auth.js` — JWT verify + role check
- `seed-owner.js` — owner account banane ki script
- `public/intro.html`, `public/login.html`, `public/feed.html` — animated frontend
- `.env.example` — sabhi secrets ka template

## Aage kya
Ye sirf pehla setup hai jaisa aapne bola. Comments, multiple-owner admin panel, edit/delete post, jaisi cheezein aap agle step me batayenge to unhe isi structure par add kar denge.
