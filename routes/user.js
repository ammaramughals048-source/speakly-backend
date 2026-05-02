const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect } = require('../middleware/auth');

// ── Get My Profile ──
router.get('/profile', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        res.json({ success: true, user });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ── Update XP & Streak ──
router.put('/progress', protect, async (req, res) => {
    try {
        const { xp, streak, level, languages } = req.body;
        const user = await User.findByIdAndUpdate(
            req.user.id,
            { xp, streak, level, languages, lastActive: Date.now() },
            { new: true }
        ).select('-password');
        res.json({ success: true, user });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ── Add Language ──
router.post('/language', protect, async (req, res) => {
    try {
        const { name, flag } = req.body;
        const user = await User.findById(req.user.id);
        const already = user.languages.find(l => l.name === name);
        if (already) {
            return res.status(400).json({ message: 'Language already added' });
        }
        user.languages.push({ name, flag, progress: 0 });
        await user.save();
        res.json({ success: true, languages: user.languages });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ── Delete Language ──
router.delete('/language/:name', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        user.languages = user.languages.filter(
            l => l.name !== req.params.name
        );
        await user.save();
        res.json({ success: true, languages: user.languages });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ── Get Leaderboard ──
router.get('/leaderboard', protect, async (req, res) => {
    try {
        const users = await User.find({ role: 'Learner' })
            .select('name username xp streak level')
            .sort({ xp: -1 })
            .limit(20);
        res.json({ success: true, users });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;