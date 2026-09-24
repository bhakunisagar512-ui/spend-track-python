const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const pool = require('../config/db');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

const register = async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, avatar_url',
      [name.trim(), email.toLowerCase(), hash]
    );

    const user = result.rows[0];
    const token = generateToken(user.id);
    res.status(201).json({ token, user });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
};

const login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const result = await pool.query(
      'SELECT id, name, email, password_hash, avatar_url, gemini_api_key FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (!result.rows.length) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];
    if (!user.password_hash) {
      return res.status(401).json({ error: 'This account uses Google sign-in' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = generateToken(user.id);
    const { password_hash, ...safeUser } = user;
    res.json({ token, user: safeUser });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
};

// Resolves a verified Google profile from either an ID token (Google's rendered
// button / One Tap) or an OAuth access token (custom button via the popup flow).
const getGoogleProfile = async ({ credential, access_token }) => {
  if (credential) {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const { sub, email, email_verified, name, picture } = ticket.getPayload();
    return { sub, email, emailVerified: email_verified === true, name, picture };
  }

  // Access tokens aren't self-verifying: confirm it was issued to this app, or a
  // token minted for some other site could be replayed here to log in as its user
  const info = await googleClient.getTokenInfo(access_token);
  if (info.aud !== process.env.GOOGLE_CLIENT_ID) {
    throw new Error('Access token was issued for a different client');
  }
  const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!r.ok) throw new Error(`Google userinfo failed with ${r.status}`);
  const profile = await r.json();
  if (profile.sub !== info.sub) throw new Error('Google token subject mismatch');
  return { sub: profile.sub, email: profile.email, emailVerified: profile.email_verified === true, name: profile.name, picture: profile.picture };
};

const googleAuth = async (req, res) => {
  const { credential, access_token } = req.body;
  if (!credential && !access_token) {
    return res.status(400).json({ error: 'Google credential required' });
  }

  try {
    const { sub: googleId, email, emailVerified, name, picture } = await getGoogleProfile({ credential, access_token });
    // Accounts are linked by email below, so only trust addresses Google has verified
    if (!email || !emailVerified) {
      return res.status(401).json({ error: 'Your Google email address is not verified' });
    }

    let result = await pool.query('SELECT id, name, email, avatar_url, gemini_api_key FROM users WHERE google_id = $1', [googleId]);

    if (!result.rows.length) {
      result = await pool.query('SELECT id, name, email, avatar_url, gemini_api_key FROM users WHERE email = $1', [email.toLowerCase()]);
      if (result.rows.length) {
        await pool.query('UPDATE users SET google_id = $1, avatar_url = $2 WHERE id = $3', [googleId, picture, result.rows[0].id]);
        result = await pool.query('SELECT id, name, email, avatar_url, gemini_api_key FROM users WHERE id = $1', [result.rows[0].id]);
      } else {
        result = await pool.query(
          'INSERT INTO users (name, email, google_id, avatar_url) VALUES ($1, $2, $3, $4) RETURNING id, name, email, avatar_url, gemini_api_key',
          [name, email.toLowerCase(), googleId, picture]
        );
      }
    }

    const user = result.rows[0];
    const token = generateToken(user.id);
    res.json({ token, user });
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(401).json({ error: 'Google authentication failed' });
  }
};

const getMe = async (req, res) => {
  res.json({ user: req.user });
};

const updateApiKey = async (req, res) => {
  const { gemini_api_key } = req.body;
  try {
    await pool.query('UPDATE users SET gemini_api_key = $1, updated_at = NOW() WHERE id = $2', [gemini_api_key || null, req.user.id]);
    res.json({ message: 'API key updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update API key' });
  }
};

module.exports = { register, login, googleAuth, getMe, updateApiKey };
