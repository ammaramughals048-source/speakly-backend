const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const passport = require('passport');

dotenv.config();

const app = express();

// Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
    credentials: true
}));
app.use(express.json());
app.use(passport.initialize());  // ← Google OAuth ke liye zaroori

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/user', require('./routes/user'));
app.use('/api/admin', require('./routes/admin'));

// Test route
app.get('/', (req, res) => {
    res.json({ message: 'Speakly Backend Running! 🚀' });
});

// MongoDB Connect
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