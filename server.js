const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const passport = require('passport');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');

dotenv.config();

const app = express();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. HELMET — Security Headers
//    XSS, Clickjacking, MIME sniffing etc se bachata hai
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.use(helmet());

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. CORS — Sirf frontend URL ko allow karo
//    Doosri websites backend use nahi kar sakti
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
    credentials: true
}));

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. RATE LIMITING — Brute Force Attack Prevention
//    Ek IP se 15 min mein max 100 requests
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: { message: 'Too many requests. Please try again after 15 minutes.' }
});
app.use(globalLimiter);

// Login/Register ke liye strict limit — 10 attempts per 15 min
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { message: 'Too many login attempts. Please try again after 15 minutes.' }
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. BODY PARSER — Max 10kb request size
//    Large payload attacks se bachata hai
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.use(express.json({ limit: '10kb' }));

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. NoSQL INJECTION PREVENTION
//    MongoDB query injection se bachata hai
//    e.g. { "$gt": "" } jaise attacks
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.use(mongoSanitize());

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. XSS CLEAN — Cross Site Scripting Prevention
//    <script> jaise malicious HTML input clean karta hai
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.use(xss());

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. PASSPORT — Google OAuth
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.use(passport.initialize());

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ROUTES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.use('/api/auth', require('./routes/auth'));
app.use('/api/user', require('./routes/user'));
app.use('/api/admin', require('./routes/admin'));

// Test route
app.get('/', (req, res) => {
    res.json({ message: 'Speakly Backend Running! 🚀' });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MongoDB Connect
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('✅ MongoDB Connected!');
        app.listen(process.env.PORT || 5000, () => {
            console.log(`🚀 Server running on port ${process.env.PORT || 5000}`);
        });
    })
    .catch(err => {
        console.log('❌ MongoDB Error:', err.message);
    });