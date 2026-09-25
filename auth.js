const jwt = require('jsonwebtoken');

// Request me Authorization: Bearer <token> check karta hai
function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Login required. Token missing hai.' });
  }
  const token = header.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { id, name, role }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Session expire ho gayi ya token invalid hai. Dobara login karein.' });
  }
}

// Sirf diye gaye role ko aage jaane do (jaise 'owner')
function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ error: `Ye action sirf ${role} kar sakta hai.` });
    }
    next();
  };
}

module.exports = { authenticate, requireRole };
