const express = require("express");
const mongoose = require("mongoose");
const QRCode = require("qrcode");

const Dog = require("../models/Dog");
const { auth, isAuthorized } = require("../middleware/authMiddleware");

const router = express.Router();

const getFrontendBaseUrl = () =>
  process.env.FRONTEND_URL || "https://pawtrack-frontend.vercel.app";

const buildDogUrl = (dogId) => `${getFrontendBaseUrl()}/dog/${dogId}`;

const ensureQrCode = async (dog) => {
  if (dog.qrCode) {
    return dog;
  }

  dog.qrCode = await QRCode.toDataURL(buildDogUrl(dog._id));
  await dog.save();
  return dog;
};

router.get("/", async (req, res) => {
  try {
    const dogs = await Dog.find();
    const today = new Date();
    const dogsWithQrCodes = await Promise.all(dogs.map(ensureQrCode));

    const dogsWithAlerts = dogsWithQrCodes.map((dog) => {
      let alertStatus = "none";
      let alertMessage = "";

      if (dog.reports.length > 0) {
        alertStatus = "attention";
        alertMessage = "Dog needs attention";
      } else if (dog.nextVaccinationDate) {
        const nextDate = new Date(dog.nextVaccinationDate);
        const diff = (nextDate - today) / (1000 * 60 * 60 * 24);

        if (diff < 0) {
          alertStatus = "overdue";
          alertMessage = "Vaccination overdue";
        } else if (diff <= 3) {
          alertStatus = "dueSoon";
          alertMessage = "Vaccination due soon";
        }
      }

      return {
        ...dog._doc,
        alertStatus,
        alertMessage,
      };
    });

    res.json(dogsWithAlerts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Error fetching dogs" });
  }
});

router.post("/", auth, isAuthorized, async (req, res) => {
  try {
    const dog = new Dog(req.body);
    await dog.save();

    dog.qrCode = await QRCode.toDataURL(buildDogUrl(dog._id));
    await dog.save();

    res.json(dog);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Error adding dog" });
  }
});

router.put("/update/:id", auth, isAuthorized, async (req, res) => {
  try {
    const dog = await Dog.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });

    res.json(dog);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Error updating dog" });
  }
});

router.delete("/:id", auth, isAuthorized, async (req, res) => {
  try {
    const dog = await Dog.findByIdAndDelete(req.params.id);

    if (!dog) {
      return res.status(404).json({ msg: "Dog not found" });
    }

    res.json({ msg: "Dog deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Error deleting dog" });
  }
});

router.post("/report/:id", async (req, res) => {
  try {
    const dog = await Dog.findById(req.params.id);

    if (!dog) {
      return res.status(404).json({ msg: "Dog not found" });
    }

    dog.reports.push({
      message: req.body.message,
      date: new Date(),
    });

    await dog.save();

    res.json({ msg: "Report added" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Error reporting issue" });
  }
});

router.post("/health/:id", auth, isAuthorized, async (req, res) => {
  try {
    const { vaccinationDate, treatment, notes, type } = req.body;

    const dog = await Dog.findById(req.params.id);
    if (!dog) {
      return res.status(404).json({ msg: "Dog not found" });
    }

    let nextDueDate = null;

    if (type === "vaccination" && vaccinationDate) {
      nextDueDate = new Date(vaccinationDate);
      nextDueDate.setMonth(nextDueDate.getMonth() + 12);

      dog.lastVaccinationDate = vaccinationDate;
      dog.nextVaccinationDate = nextDueDate;
      dog.vaccinated = true;
    }

    dog.healthRecords.push({
      vaccinationDate,
      nextDueDate,
      treatment,
      notes,
      type,
    });

    await dog.save();

    res.json({ msg: "Health record added", dog });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Error adding health record" });
  }
});

router.get("/alerts", async (req, res) => {
  try {
    const dogs = await Dog.find();
    const today = new Date();

    const alerts = dogs.map((dog) => {
      let status = "safe";
      let message = "";

      if (dog.reports.length > 0) {
        status = "attention";
        message = "Dog needs attention";
      } else if (dog.nextVaccinationDate) {
        const diff =
          (new Date(dog.nextVaccinationDate) - today) / (1000 * 60 * 60 * 24);

        if (diff < 0) {
          status = "overdue";
          message = "Vaccination overdue";
        } else if (diff <= 3) {
          status = "dueSoon";
          message = "Vaccination due soon";
        }
      }

      return {
        dogId: dog._id,
        name: dog.name,
        status,
        message,
        nextVaccinationDate: dog.nextVaccinationDate,
      };
    });

    res.json(alerts);
  } catch (err) {
    res.status(500).json({ msg: "Error fetching alerts" });
  }
});

router.get("/stats", async (req, res) => {
  try {
    const dogs = await Dog.find();
    const today = new Date();

    let total = dogs.length;
    let vaccinated = 0;
    let overdue = 0;
    let dueSoon = 0;
    let attention = 0;

    dogs.forEach((dog) => {
      if (dog.vaccinated) {
        vaccinated++;
      }

      if (dog.reports.length > 0) {
        attention++;
      }

      if (dog.nextVaccinationDate) {
        const diff =
          (new Date(dog.nextVaccinationDate) - today) / (1000 * 60 * 60 * 24);

        if (diff < 0) {
          overdue++;
        } else if (diff <= 3) {
          dueSoon++;
        }
      }
    });

    res.json({ total, vaccinated, overdue, dueSoon, attention });
  } catch (err) {
    res.status(500).json({ msg: "Error fetching stats" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ msg: "Invalid Dog ID" });
    }

    const dog = await Dog.findById(id);

    if (!dog) {
      return res.status(404).json({ msg: "Dog not found" });
    }

    await ensureQrCode(dog);

    res.json(dog);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Error fetching dog" });
  }
});

module.exports = router;
