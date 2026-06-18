const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

// ── OTP Generator ──
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// ── JWT Token Generator ──
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRE || '7d'
    });
};

// ── Google OAuth Strategy ──
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: 'https://speakly-backend-production-9ef4.up.railway.app/api/auth/google/callback'
},
async (accessToken, refreshToken, profile, done) => {
    try {
        const email = profile.emails[0].value;
        const name = profile.displayName;
        const googleId = profile.id;
        let user = await User.findOne({ $or: [{ googleId }, { email }] });
        if (user) {
            if (!user.googleId) { user.googleId = googleId; await user.save(); }
            return done(null, user);
        }
        const baseUsername = name.toLowerCase().replace(/\s+/g, '') + Math.floor(Math.random() * 1000);
        user = await User.create({ name, username: baseUsername, email, googleId, password: null, role: 'Learner', isVerified: true });
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

// ── POST /api/auth/register ──
// Saves user + generates OTP, returns OTP to frontend (frontend sends email via EmailJS)
router.post('/register', async (req, res) => {
    try {
        const { name, username, email, password, role } = req.body;

        const existingEmail = await User.findOne({ email });
        if (existingEmail && existingEmail.isVerified) {
            return res.status(400).json({ message: 'Email already registered' });
        }

        const existingUsername = await User.findOne({ username });
        if (existingUsername && existingUsername.isVerified) {
            return res.status(400).json({ message: 'Username already taken' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const otp = generateOTP();
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

        if (existingEmail && !existingEmail.isVerified) {
            existingEmail.name = name;
            existingEmail.username = username;
            existingEmail.password = hashedPassword;
            existingEmail.otp = otp;
            existingEmail.otpExpiry = otpExpiry;
            await existingEmail.save();
        } else {
            await User.create({ name, username, email, password: hashedPassword, role: role || 'Learner', isVerified: false, otp, otpExpiry });
        }

        // Return OTP to frontend — frontend will send email via EmailJS
        res.status(201).json({ success: true, message: 'User saved. Send OTP via frontend.', email, otp });

    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ message: error.message });
    }
});

// ── POST /api/auth/verify-otp ──
router.post('/verify-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: 'User not found' });
        if (user.isVerified) return res.status(400).json({ message: 'Already verified' });
        if (user.otp !== otp) return res.status(400).json({ message: 'Invalid OTP. Try again.' });
        if (new Date() > user.otpExpiry) return res.status(400).json({ message: 'OTP expired. Request a new one.' });

        user.isVerified = true;
        user.otp = null;
        user.otpExpiry = null;
        await user.save();

        const token = generateToken(user._id);
        res.json({ success: true, message: 'Email verified!', token, user: { id: user._id, name: user.name, username: user.username, email: user.email, role: user.role, xp: user.xp, streak: user.streak, level: user.level } });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ── POST /api/auth/resend-otp ──
router.post('/resend-otp', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: 'User not found' });
        if (user.isVerified) return res.status(400).json({ message: 'Already verified' });

        const otp = generateOTP();
        user.otp = otp;
        user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
        await user.save();

        // Return new OTP to frontend
        res.json({ success: true, message: 'New OTP generated!', otp });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ── POST /api/auth/login ──
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ message: 'Invalid email or password' });
        if (!user.password) return res.status(400).json({ message: 'This account uses Google login.' });
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: 'Invalid email or password' });
        if (!user.isVerified) return res.status(403).json({ message: 'Please verify your email first.', needsVerification: true, email: user.email });
        if (user.isBlocked) return res.status(403).json({ message: 'Account blocked. Contact support.' });

        const token = generateToken(user._id);
        res.json({ success: true, token, user: { id: user._id, name: user.name, username: user.username, email: user.email, role: user.role, xp: user.xp, streak: user.streak, level: user.level } });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ── Google OAuth Routes ──
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/google/callback',
    passport.authenticate('google', { session: false, failureRedirect: `${process.env.FRONTEND_URL}/login.html?error=google_failed` }),
    (req, res) => {
        const token = generateToken(req.user._id);
        const user = encodeURIComponent(JSON.stringify({ id: req.user._id, name: req.user.name, username: req.user.username, email: req.user.email, role: req.user.role, xp: req.user.xp, streak: req.user.streak, level: req.user.level }));
        res.redirect(`${process.env.FRONTEND_URL}/dashboard.html?token=${token}&user=${user}`);
    }
);

// ── Reset Admin Password ──
router.post('/reset-admin-password', async (req, res) => {
    try {
        const { email, newPassword, secretKey } = req.body;
        if (secretKey !== 'speakly-reset-2024') return res.status(403).json({ message: 'Invalid secret key' });
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: 'User not found' });
        if (user.role !== 'Admin') return res.status(403).json({ message: 'Not an admin account' });
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();
        res.json({ success: true, message: `Password reset for ${user.email}` });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;