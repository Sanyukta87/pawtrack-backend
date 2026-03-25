const express = require("express");
const router = express.Router();

const Report = require("../models/Report");
const { auth, isAuthorized } = require("../middleware/authMiddleware");

// Public: Report dog
router.post("/add", async (req, res) => {
  const report = new Report(req.body);
  await report.save();
  res.json(report);
});

// NGO: View reports
router.get("/", auth, isAuthorized, async (req, res) => {
  const reports = await Report.find();
  res.json(reports);
});

// Mark resolved
router.put("/:id", auth, isAuthorized, async (req, res) => {
  const report = await Report.findByIdAndUpdate(
    req.params.id,
    { status: "resolved" },
    { new: true }
  );
  res.json(report);
});

module.exports = router;