const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("../models/User");

// 🔐 SIGNUP
router.post("/signup", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    const hashed = await bcrypt.hash(password, 10);

    const user = new User({
      name,
      email,
      password: hashed,
      role // ✅ HERE
    });

    await user.save();

    res.json({ msg: "User created" });

  } catch (err) {
    res.status(500).json({ msg: "Error signup" });
  }
});

// 🔐 LOGIN
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (!user) return res.status(400).json({ msg: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) return res.status(400).json({ msg: "Wrong password" });

    const token = jwt.sign(
      { id: user._id, role: user.role },
      "secret123"
    );

    res.json({
      token,
      role: user.role
    });

  } catch (err) {
    res.status(500).json({ msg: "Error login" });
  }
});

module.exports = router;