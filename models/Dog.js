const mongoose = require("mongoose");

// 🏥 Health Record Schema
const healthRecordSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["vaccination", "treatment"],
    default: "treatment",
  },
  vaccinationDate: {
    type: Date,
    validate: {
      validator(value) {
        if (this.type === "vaccination") {
          return value instanceof Date && !Number.isNaN(value.getTime());
        }

        return true;
      },
      message: "vaccinationDate is required for vaccination records",
    },
  },
  nextDueDate: Date,
  treatment: {
    type: String,
    trim: true,
  },
  notes: {
    type: String,
    trim: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// 🐶 Dog Schema
const dogSchema = new mongoose.Schema(
  {
    dogId: {
      type: String,
      unique: true,
      required: true,
      trim: true,
    },

    name: {
      type: String,
      required: true,
    },

    location: String,
    color: String,
    gender: String,

    vaccinated: {
      type: Boolean,
      default: false,
    },

    sterilized: {
      type: Boolean,
      default: false,
    },

    earNotch: {
      type: Boolean,
      default: false,
    },

    // 📅 Vaccination Tracking
    lastVaccinationDate: Date,
    nextVaccinationDate: Date,

    // 🧠 Alert System
    alertStatus: {
      type: String,
      enum: ["none", "dueSoon", "overdue", "attention"],
      default: "none",
    },

    alertMessage: String,

    // 📝 Notes
    notes: String,

    // 🔗 QR Code
    qrCode: String,

    // 🏥 Health Records
    healthRecords: {
      type: [healthRecordSchema],
      default: [],
    },

    // 🚨 Reports
    reports: [
      {
        message: {
          type: String,
          required: true,
        },
        date: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.models.Dog || mongoose.model("Dog", dogSchema);
