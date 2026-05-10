const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

// ── JWT Token Generator ──
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRE || '7d'
    });
};

// ── Google OAuth Strategy Setup ──
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/api/auth/google/callback'
},
async (accessToken, refreshToken, profile, done) => {
    try {
        const email = profile.emails[0].value;
        const name = profile.displayName;
        const googleId = profile.id;

        // Check if user already exists (by googleId or email)
        let user = await User.findOne({ $or: [{ googleId }, { email }] });

        if (user) {
            // Agar email se mila but googleId nahi tha — update karo
            if (!user.googleId) {
                user.googleId = googleId;
                await user.save();
            }
            return done(null, user);
        }

        // New user — auto-generate username
        const baseUsername = name.toLowerCase().replace(/\s+/g, '') + Math.floor(Math.random() * 1000);

        user = await User.create({
            name,
            username: baseUsername,
            email,
            googleId,
            password: null,
            role: 'Learner'
        });

        return done(null, user);

    } catch (error) {
        return done(error, null);
    }
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
    const user = await User.findById(id);
    done(null, user);
});

// ══════════════════════════════════════
// POST /api/auth/register
// ══════════════════════════════════════
router.post('/register', async (req, res) => {
    try {
        const { name, username, email, password, role } = req.body;

        // Check duplicate
        const existingEmail = await User.findOne({ email });
        if (existingEmail) return res.status(400).json({ message: 'Email already registered' });

        const existingUsername = await User.findOne({ username });
        if (existingUsername) return res.status(400).json({ message: 'Username already taken' });

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = await User.create({
            name,
            username,
            email,
            password: hashedPassword,
            role: role || 'Learner'
        });

        const token = generateToken(user._id);

        res.status(201).json({
            success: true,
            token,
            user: {
                id: user._id,
                name: user.name,
                username: user.username,
                email: user.email,
                role: user.role,
                xp: user.xp,
                streak: user.streak,
                level: user.level
            }
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ══════════════════════════════════════
// POST /api/auth/login
// ══════════════════════════════════════
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ message: 'Invalid email or password' });

        // Google-only user ko password login nahi karne dena
        if (!user.password) {
            return res.status(400).json({ message: 'This account uses Google login. Please sign in with Google.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: 'Invalid email or password' });

        if (user.isBlocked) return res.status(403).json({ message: 'Account blocked. Contact support.' });

        const token = generateToken(user._id);

        res.json({
            success: true,
            token,
            user: {
                id: user._id,
                name: user.name,
                username: user.username,
                email: user.email,
                role: user.role,
                xp: user.xp,
                streak: user.streak,
                level: user.level
            }
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ══════════════════════════════════════
// GET /api/auth/google  ← Frontend button yahan bhejna
// ══════════════════════════════════════
router.get('/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
);

// ══════════════════════════════════════
// GET /api/auth/google/callback  ← Google redirect
// ══════════════════════════════════════
router.get('/google/callback',
    passport.authenticate('google', { session: false, failureRedirect: `${process.env.FRONTEND_URL}/login.html?error=google_failed` }),
    (req, res) => {
        const token = generateToken(req.user._id);
        const user = {
            id: req.user._id,
            name: req.user.name,
            username: req.user.username,
            email: req.user.email,
            role: req.user.role,
            xp: req.user.xp,
            streak: req.user.streak,
            level: req.user.level
        };

        // Token aur user ko frontend URL mein pass karo
        const userData = encodeURIComponent(JSON.stringify(user));
        res.redirect(`${process.env.FRONTEND_URL}/dashboard.html?token=${token}&user=${userData}`);
    }
);

module.exports = router;