const crypto = require("crypto");
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("../models/User");

const router = express.Router();

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_ROLES = ["admin", "volunteer", "vet"];
const VERIFICATION_WINDOW_MS = 1000 * 60 * 60 * 24;

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const getFrontendBaseUrl = () =>
  process.env.FRONTEND_URL || process.env.CLIENT_URL || "http://localhost:5173";
const hashVerificationToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");
const createVerificationToken = () => crypto.randomBytes(32).toString("hex");

const sendVerificationEmail = async ({ email, verificationUrl }) => {
  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASS,
    SMTP_FROM,
  } = process.env;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) {
    return {
      delivered: false,
      reason: "SMTP is not configured",
    };
  }

  let nodemailer;

  try {
    nodemailer = require("nodemailer");
  } catch (error) {
    throw new Error("nodemailer is required when SMTP is configured");
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: SMTP_FROM,
    to: email,
    subject: "Verify your PawTrack account",
    html: `
      <p>Welcome to PawTrack.</p>
      <p>Please verify your email by clicking the link below:</p>
      <p><a href="${verificationUrl}">Verify Email</a></p>
      <p>This link will expire in 24 hours.</p>
    `,
  });

  return { delivered: true };
};

router.post("/signup", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");
    const role = req.body.role || "volunteer";

    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ msg: "Name, email, and password are required" });
    }

    if (!EMAIL_PATTERN.test(email)) {
      return res.status(400).json({ msg: "Enter a valid email address" });
    }

    if (password.length < 8) {
      return res
        .status(400)
        .json({ msg: "Password must be at least 8 characters long" });
    }

    if (!ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({ msg: "Invalid role selected" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ msg: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const verificationToken = createVerificationToken();
    const verificationTokenHash = hashVerificationToken(verificationToken);
    const verificationTokenExpires = new Date(Date.now() + VERIFICATION_WINDOW_MS);
    const verificationUrl = `${getFrontendBaseUrl()}/verify-email?token=${verificationToken}`;

    const user = new User({
      name,
      email,
      password: hashedPassword,
      role,
      isVerified: false,
      verificationTokenHash,
      verificationTokenExpires,
    });

    await user.save();

    const emailResult = await sendVerificationEmail({ email, verificationUrl });

    return res.status(201).json({
      msg: emailResult.delivered
        ? "Signup successful. Check your email to verify your account."
        : "Signup successful. Verify your account using the verification link.",
      verificationRequired: true,
      verificationUrl: emailResult.delivered ? undefined : verificationUrl,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ msg: "Error during signup" });
  }
});

router.get("/verify-email", async (req, res) => {
  try {
    const token = String(req.query.token || "").trim();

    if (!token) {
      return res.status(400).json({ msg: "Verification token is required" });
    }

    const tokenHash = hashVerificationToken(token);

    const user = await User.findOne({
      verificationTokenHash: tokenHash,
      verificationTokenExpires: { $gt: new Date() },
    }).select("+verificationTokenHash +verificationTokenExpires");

    if (!user) {
      return res.status(400).json({ msg: "Verification link is invalid or expired" });
    }

    user.isVerified = true;
    user.verificationTokenHash = undefined;
    user.verificationTokenExpires = undefined;
    await user.save();

    return res.json({ msg: "Email verified successfully" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ msg: "Error verifying email" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");

    if (!email || !password) {
      return res.status(400).json({ msg: "Email and password are required" });
    }

    if (!EMAIL_PATTERN.test(email)) {
      return res.status(400).json({ msg: "Enter a valid email address" });
    }

    const user = await User.findOne({ email }).select("+password");

    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ msg: "Invalid credentials" });
    }

    if (!user.isVerified) {
      return res.status(403).json({ msg: "Please verify your email before logging in" });
    }

    const token = jwt.sign(
      { userId: user._id.toString(), role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    return res.json({
      token,
      role: user.role,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ msg: "Error during login" });
  }
});

module.exports = router;
