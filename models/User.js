const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true
    },
    password: {
        type: String,
        required: true
    },
    role: {
        type: String,
        enum: ['Learner', 'Admin'],
        default: 'Learner'
    },
    isBlocked: {
        type: Boolean,
        default: false
    },
    xp: {
        type: Number,
        default: 0
    },
    streak: {
        type: Number,
        default: 0
    },
    level: {
        type: Number,
        default: 1
    },
    languages: [{
        name: String,
        flag: String,
        progress: {
            type: Number,
            default: 0
        }
    }],
    badges: [{
        name: String,
        icon: String,
        earnedAt: Date
    }],
    lastActive: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);