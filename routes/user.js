// const mongoose = require('mongoose');

// const UserSchema = new mongoose.Schema({
//     name: {
//         type: String,
//         required: true,
//         trim: true
//     },
//     username: {
//         type: String,
//         required: true,
//         unique: true,
//         trim: true
//     },
//     email: {
//         type: String,
//         required: true,
//         unique: true,
//         lowercase: true
//     },
//     password: {
//         type: String,
//         required: false   // ← Google users ka password nahi hoga
//     },
//     googleId: {
//         type: String,
//         default: null     // ← Google OAuth users ka ID store hoga
//     },
//     role: {
//         type: String,
//         enum: ['Learner', 'Admin'],
//         default: 'Learner'
//     },
//     isBlocked: {
//         type: Boolean,
//         default: false
//     },
//     xp: {
//         type: Number,
//         default: 0
//     },
//     streak: {
//         type: Number,
//         default: 0
//     },
//     level: {
//         type: Number,
//         default: 1
//     },
//     languages: [{
//         name: String,
//         flag: String,
//         progress: {
//             type: Number,
//             default: 0
//         }
//     }],
//     badges: [{
//         name: String,
//         icon: String,
//         earnedAt: Date
//     }],
//     lastActive: {
//         type: Date,
//         default: Date.now
//     },
//     isVerified: {
//         type: Boolean,
//         default: false
//     },
//     otp: {
//         type: String,
//         default: null
//     },
//     otpExpiry: {
//         type: Date,
//         default: null
//     }
// }, { timestamps: true });

// module.exports = mongoose.model('User', UserSchema);

const express = require('express');
const router = express.Router();
const User = require('../models/User');
router.post('/send-otp' , async (req, res)=>{
    try {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ message: 'Email required hai' });
  }

  // 6 digit OTP banao
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  
  // User dhoondo ya naya banao
  let user = await User.findOne({ email });
  if (!user) {
    user = new User({ email });
  }

  // OTP + expiry save karo - 10 min ke liye
  user.otp = otp;
  user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
  await user.save();

  // Email bhejo - nodemailer use kar rahe ho to
  // await sendOTPEmail(email, otp); 

  res.json({ message: 'OTP bhej diya hai email pe', success: true });

} catch (err) {
  console.log(err);
  res.status(500).json({ message: 'Server error' });
}
});

module.exports = router;