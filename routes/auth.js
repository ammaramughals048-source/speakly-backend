const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const nodemailer = require('nodemailer');
const User = require('../models/User');

// ── Nodemailer Setup (Gmail) ──
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS   // Gmail App Password (16 chars)
    }
});

// ── OTP Generator ──
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// ── Send OTP Email ──
const sendOTPEmail = async (email, otp, name) => {
    await transporter.sendMail({
        from: `"Speakly 🐦" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Your Speakly Verification Code',
        html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#0c1021;color:#e0f7ff;padding:32px;border-radius:16px;border:1px solid rgba(0,242,254,0.2);">
            <h2 style="color:#00f2fe;margin-bottom:8px;">Hey ${name}! 👋</h2>
            <p style="color:#7a9bb5;margin-bottom:24px;">Welcome to Speakly! Here is your verification code:</p>
            <div style="background:rgba(0,242,254,0.08);border:2px solid #00f2fe;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
                <span style="font-size:42px;font-weight:900;letter-spacing:12px;color:#00f2fe;">${otp}</span>
            </div>
            <p style="color:#7a9bb5;font-size:13px;">This code expires in <strong style="color:#ffcc00;">10 minutes</strong>. Do not share it with anyone.</p>
            <p style="color:#7a9bb5;font-size:12px;margin-top:16px;">If you did not sign up for Speakly, ignore this email.</p>
        </div>`
    });
};

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
    callbackURL: 'https://speakly-backend-production-9ef4.up.railway.app/api/auth/google/callback'
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
// Step 1: Save user (unverified) + send OTP
// ══════════════════════════════════════
router.post('/register', async (req, res) => {
    try {
        const { name, username, email, password, role } = req.body;

        // Check duplicate email
        const existingEmail = await User.findOne({ email });
        if (existingEmail && existingEmail.isVerified) {
            return res.status(400).json({ message: 'Email already registered' });
        }

        // Check duplicate username
        const existingUsername = await User.findOne({ username });
        if (existingUsername && existingUsername.isVerified) {
            return res.status(400).json({ message: 'Username already taken' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Generate OTP
        const otp = generateOTP();
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // If unverified account exists with same email, update it
        if (existingEmail && !existingEmail.isVerified) {
            existingEmail.name = name;
            existingEmail.username = username;
            existingEmail.password = hashedPassword;
            existingEmail.otp = otp;
            existingEmail.otpExpiry = otpExpiry;
            await existingEmail.save();
        } else {
            await User.create({
                name, username, email,
                password: hashedPassword,
                role: role || 'Learner',
                isVerified: false,
                otp,
                otpExpiry
            });
        }

        // Send OTP email
        await sendOTPEmail(email, otp, name);

        res.status(201).json({
            success: true,
            message: 'OTP sent to your email. Please verify to complete registration.',
            email  // frontend ko pata rahe kahan verify karna hai
        });

    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ message: error.message });
    }
});

// ══════════════════════════════════════
// POST /api/auth/verify-otp
// Step 2: Verify OTP → activate account
// ══════════════════════════════════════
router.post('/verify-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;

        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: 'User not found' });
        if (user.isVerified) return res.status(400).json({ message: 'Account already verified' });

        // Check OTP
        if (user.otp !== otp) {
            return res.status(400).json({ message: 'Invalid OTP. Please try again.' });
        }

        // Check expiry
        if (new Date() > user.otpExpiry) {
            return res.status(400).json({ message: 'OTP expired. Please request a new one.' });
        }

        // Activate account
        user.isVerified = true;
        user.otp = null;
        user.otpExpiry = null;
        await user.save();

        const token = generateToken(user._id);

        res.json({
            success: true,
            message: 'Email verified successfully! Welcome to Speakly 🎉',
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
// POST /api/auth/resend-otp
// ══════════════════════════════════════
router.post('/resend-otp', async (req, res) => {
    try {
        const { email } = req.body;

        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: 'User not found' });
        if (user.isVerified) return res.status(400).json({ message: 'Account already verified' });

        const otp = generateOTP();
        user.otp = otp;
        user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
        await user.save();

        await sendOTPEmail(email, otp, user.name);

        res.json({ success: true, message: 'New OTP sent to your email!' });

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

        if (!user.isVerified) return res.status(403).json({ message: 'Please verify your email first. Check your inbox for the OTP.', needsVerification: true, email: user.email });
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

// ══════════════════════════════════════
// POST /api/auth/reset-admin-password
// TEMPORARY ROUTE — delete after use!
// ══════════════════════════════════════
router.post('/reset-admin-password', async (req, res) => {
    try {
        const { email, newPassword, secretKey } = req.body;

        // Secret key check — sirf tum jaante ho
        if (secretKey !== 'speakly-reset-2024') {
            return res.status(403).json({ message: 'Invalid secret key' });
        }

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