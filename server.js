require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb, initDb } = require('./db');
const { authenticate, requireRole } = require('./auth');

const app = express();
const PORT = process.env.PORT || 5000;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

app.use(cors());
app.use(express.json());

initDb();

/* ==========================================================
   AUTH: signup (normal users only) + login (users + owners)
   ========================================================== */

app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email aur password zaroori hain.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password kam se kam 6 characters ka hona chahiye.' });
    }

    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (existing) {
      return res.status(409).json({ error: 'Is email se pehle se account bana hua hai.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    // Public signup se hamesha role 'user' hi banega, 'owner' kabhi nahi
    const info = db
      .prepare('INSERT INTO users (name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(name.trim(), email.toLowerCase(), passwordHash, 'user', new Date().toISOString());

    const token = jwt.sign(
      { id: info.lastInsertRowid, name: name.trim(), role: 'user' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({ token, user: { id: info.lastInsertRowid, name: name.trim(), role: 'user' } });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Signup fail ho gaya. Dobara try karein.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email aur password zaroori hain.' });
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
    if (!user) {
      return res.status(401).json({ error: 'Email ya password galat hai.' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Email ya password galat hai.' });
    }

    const token = jwt.sign(
      { id: user.id, name: user.name, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, user: { id: user.id, name: user.name, role: user.role } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login fail ho gaya. Dobara try karein.' });
  }
});

/* ==========================================================
   SITE SETTINGS: site ka naam (sirf owner edit kar sakta hai)
   ========================================================== */

app.get('/api/site-settings/name', (req, res) => {
  try {
    const db = getDb();
    const row = db.prepare('SELECT value FROM site_settings WHERE key = ?').get('site_name');
    res.json({ site_name: row ? row.value : 'My Website' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Site name load nahi ho paaya.' });
  }
});

app.put('/api/site-settings/name', authenticate, requireRole('owner'), (req, res) => {
  try {
    const { value } = req.body;
    if (!value || !value.trim()) {
      return res.status(400).json({ error: 'Naam khali nahi ho sakta.' });
    }
    const db = getDb();
    db.prepare('UPDATE site_settings SET value = ? WHERE key = ?').run(value.trim(), 'site_name');
    res.json({ site_name: value.trim() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Site name update nahi ho paaya.' });
  }
});

/* ==========================================================
   POSTS: sirf owner post kar sakta hai, sab dekh sakte hain
   ========================================================== */

app.post('/api/posts', authenticate, requireRole('owner'), (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Post khali nahi ho sakta.' });
    }
    const db = getDb();
    const createdAt = new Date().toISOString();
    const info = db
      .prepare('INSERT INTO posts (owner_id, content, created_at) VALUES (?, ?, ?)')
      .run(req.user.id, content.trim(), createdAt);

    res.status(201).json({
      id: info.lastInsertRowid,
      owner_name: req.user.name,
      content: content.trim(),
      created_at: createdAt,
      reactions: {},
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Post save nahi ho paaya.' });
  }
});

// Posts list + har post ke reaction counts (login optional; login ho to apna reaction bhi pata chalega)
app.get('/api/posts', (req, res) => {
  try {
    const db = getDb();
    const posts = db
      .prepare(
        `SELECT posts.id, posts.content, posts.created_at, users.name AS owner_name
         FROM posts JOIN users ON posts.owner_id = users.id
         ORDER BY posts.created_at DESC`
      )
      .all();

    const reactionRows = db.prepare('SELECT post_id, type, COUNT(*) as count FROM reactions GROUP BY post_id, type').all();

    // Har post ke liye reaction counts jodo, e.g. { like: 3, heart: 1 }
    const result = posts.map((p) => {
      const reactions = {};
      reactionRows
        .filter((r) => r.post_id === p.id)
        .forEach((r) => {
          reactions[r.type] = r.count;
        });
      return { ...p, reactions };
    });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Posts load nahi ho paayi.' });
  }
});

// Koi bhi logged-in user react kar sakta hai (ek user, ek post par, ek reaction)
app.post('/api/posts/:id/react', authenticate, (req, res) => {
  try {
    const postId = Number(req.params.id);
    const { type } = req.body;
    const ALLOWED_TYPES = ['like', 'heart', 'clap', 'fire'];

    if (!ALLOWED_TYPES.includes(type)) {
      return res.status(400).json({ error: 'Invalid reaction type.' });
    }

    const db = getDb();
    const post = db.prepare('SELECT id FROM posts WHERE id = ?').get(postId);
    if (!post) {
      return res.status(404).json({ error: 'Ye post nahi mili.' });
    }

    const existing = db
      .prepare('SELECT * FROM reactions WHERE post_id = ? AND user_id = ?')
      .get(postId, req.user.id);

    if (existing && existing.type === type) {
      // Same reaction dobara dabayi -> reaction hata do (toggle off)
      db.prepare('DELETE FROM reactions WHERE id = ?').run(existing.id);
      return res.json({ status: 'removed' });
    } else if (existing) {
      // Reaction badal do
      db.prepare('UPDATE reactions SET type = ?, created_at = ? WHERE id = ?').run(
        type,
        new Date().toISOString(),
        existing.id
      );
      return res.json({ status: 'updated' });
    } else {
      db.prepare('INSERT INTO reactions (post_id, user_id, type, created_at) VALUES (?, ?, ?, ?)').run(
        postId,
        req.user.id,
        type,
        new Date().toISOString()
      );
      return res.json({ status: 'added' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Reaction save nahi ho paayi.' });
  }
});

/* ==========================================================
   VIDEO UPLOAD (pehle wala feature, jaisa tha waisa hai)
   ========================================================== */

const ALLOWED_MIME_TYPES = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'];
const MAX_FILE_SIZE_MB = Number(process.env.MAX_FILE_SIZE_MB || 100);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error('INVALID_FILE_TYPE'));
    }
    cb(null, true);
  },
});

app.post('/api/videos/upload', (req, res) => {
  upload.single('video')(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: `File bahut badi hai. Max ${MAX_FILE_SIZE_MB}MB.` });
      }
      if (err.message === 'INVALID_FILE_TYPE') {
        return res.status(400).json({ error: 'Invalid file type. Sirf mp4, webm, ogg, mov allowed.' });
      }
      return res.status(400).json({ error: 'Upload failed: ' + err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Koi video file receive nahi hui.' });
    }

    const title = (req.body.title || 'Untitled').trim();

    try {
      const result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          { resource_type: 'video', folder: 'video-sharing-app' },
          (error, result) => (error ? reject(error) : resolve(result))
        );
        streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
      });

      const videoUrl = result.secure_url;
      const createdAt = new Date().toISOString();
      const db = getDb();
      const info = db
        .prepare('INSERT INTO videos (title, video_url, created_at) VALUES (?, ?, ?)')
        .run(title, videoUrl, createdAt);

      res.status(201).json({ id: info.lastInsertRowid, title, video_url: videoUrl, created_at: createdAt });
    } catch (uploadErr) {
      console.error('Cloud upload error:', uploadErr);
      res.status(502).json({ error: 'Cloud storage par upload fail ho gaya.' });
    }
  });
});

app.get('/api/videos', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT id, title, video_url, created_at FROM videos ORDER BY created_at DESC').all();
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Videos fetch karne me error aayi.' });
  }
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Server par kuch galat ho gaya.' });
});

app.listen(PORT, () => {
  console.log(`Server chal raha hai: http://localhost:${PORT}`);
});
