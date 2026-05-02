const jwt = require('jsonwebtoken');
const User = require('../models/User');

// ── Protect Route (Login Check) ──
const protect = async (req, res, next) => {
    try {
        let token;
        if (req.headers.authorization && 
            req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (!token) {
            return res.status(401).json({ message: 'Not authorized' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = await User.findById(decoded.id).select('-password');
        next();

    } catch (error) {
        res.status(401).json({ message: 'Token invalid' });
    }
};

// ── Admin Only ──
const adminOnly = (req, res, next) => {
    if (req.user && req.user.role === 'Admin') {
        next();
    } else {
        res.status(403).json({ message: 'Admin access only' });
    }
};

module.exports = { protect, adminOnly };