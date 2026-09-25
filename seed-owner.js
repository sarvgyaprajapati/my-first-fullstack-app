// Ye script owner (admin) account banati/update karti hai, .env ke secret credentials se.
// Run karo: node seed-owner.js
// Future me nayi owner banani ho to .env me OWNER_EMAIL/OWNER_PASSWORD/OWNER_NAME badal kar
// isse dobara chala do — ye upsert karta hai (agar email pehle se hai to role/password update kar dega).

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { getDb, initDb } = require('./db');

async function seedOwner() {
  const { OWNER_NAME, OWNER_EMAIL, OWNER_PASSWORD } = process.env;

  if (!OWNER_NAME || !OWNER_EMAIL || !OWNER_PASSWORD) {
    console.error('Error: .env me OWNER_NAME, OWNER_EMAIL, OWNER_PASSWORD set karein.');
    process.exit(1);
  }

  initDb();
  const db = getDb();
  const passwordHash = await bcrypt.hash(OWNER_PASSWORD, 10);
  const email = OWNER_EMAIL.toLowerCase();

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);

  if (existing) {
    db.prepare('UPDATE users SET name = ?, password_hash = ?, role = ? WHERE email = ?').run(
      OWNER_NAME,
      passwordHash,
      'owner',
      email
    );
    console.log(`Owner account update ho gaya: ${email}`);
  } else {
    db.prepare(
      'INSERT INTO users (name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(OWNER_NAME, email, passwordHash, 'owner', new Date().toISOString());
    console.log(`Naya owner account ban gaya: ${email}`);
  }
}

seedOwner().catch((err) => {
  console.error('Seed fail ho gaya:', err);
  process.exit(1);
});
