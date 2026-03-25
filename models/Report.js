// models/Report.js
const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema({
  location: String,
  description: String,
  status: { type: String, default: "pending" }
}, { timestamps: true });

module.exports = mongoose.model("Report", reportSchema);