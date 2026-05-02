const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect } = require('../middleware/auth');

// ── Get All Users ──
router.get('/users', protect, async (req, res) => {
    try {
        const users = await User.find()
            .select('-password')
            .sort({ createdAt: -1 });
        res.json({ success: true, users });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ── Get Single User ──
router.get('/user/:id', protect, async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password');
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json({ success: true, user });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ── Delete User ──
router.delete('/users/:id', protect, async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ── Block / Unblock User ──
router.put('/user/:id/block', protect, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found' });
        user.isBlocked = !user.isBlocked;
        await user.save();
        res.json({ 
            success: true, 
            message: user.isBlocked ? 'User blocked' : 'User unblocked',
            isBlocked: user.isBlocked
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ── Update User Progress (Admin) ──
router.put('/user/:id/progress', protect, async (req, res) => {
    try {
        const { xp, streak, level } = req.body;
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { xp, streak, level },
            { new: true }
        ).select('-password');
        res.json({ success: true, user });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ── Get Stats Overview ──
router.get('/stats', protect, async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const blockedUsers = await User.countDocuments({ isBlocked: true });
        const topUsers = await User.find()
            .select('name username xp streak')
            .sort({ xp: -1 })
            .limit(5);
        res.json({ 
            success: true, 
            stats: { totalUsers, blockedUsers, topUsers }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;