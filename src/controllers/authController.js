const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const userModel = require('../models/userModel');

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkeyforreportingapi';

async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};

    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = await userModel.findByEmail(email.trim().toLowerCase());
    if (!user) {
      // Prevent user enumeration: identical response for non-existent users
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate signed JWT with userId, tenantId, role
    const payload = {
      userId: user.id,
      tenantId: user.tenant_id,
      role: user.role,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });

    return res.status(200).json({ token });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  login,
};
