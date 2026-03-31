const express = require("express");
const mongoose = require("mongoose");
const QRCode = require("qrcode");

const Counter = require("../models/Counter");
const Dog = require("../models/Dog");
const { auth, isAuthorized } = require("../middleware/authMiddleware");

const router = express.Router();

const getFrontendBaseUrl = () =>
  process.env.FRONTEND_URL || "http://localhost:5173";

const buildDogUrl = (dogId) => `${getFrontendBaseUrl()}/dog/${dogId}`;

const VACCINATION_DUE_SOON_DAYS = 7;
const MAX_DOG_ID_RETRIES = 200;

const isValidDate = (value) => {
  if (!value) {
    return false;
  }

  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime());
};

const calculateNextDueDate = (vaccinationDate) => {
  const nextDueDate = new Date(vaccinationDate);
  nextDueDate.setMonth(nextDueDate.getMonth() + 12);
  return nextDueDate;
};

const getVaccinationStatus = (dog, today = new Date()) => {
  if (!dog.nextVaccinationDate) {
    return "safe";
  }

  const diff =
    (new Date(dog.nextVaccinationDate) - today) / (1000 * 60 * 60 * 24);

  if (diff < 0) {
    return "overdue";
  }

  if (diff <= VACCINATION_DUE_SOON_DAYS) {
    return "dueSoon";
  }

  return "safe";
};

const getDogAlert = (dog, today = new Date()) => {
  if (dog.reports.length > 0) {
    return {
      alertStatus: "attention",
      alertMessage: "Dog needs attention",
    };
  }

  const vaccinationStatus = getVaccinationStatus(dog, today);

  if (vaccinationStatus === "overdue") {
    return {
      alertStatus: "overdue",
      alertMessage: "Vaccination overdue",
    };
  }

  if (vaccinationStatus === "dueSoon") {
    return {
      alertStatus: "dueSoon",
      alertMessage: "Vaccination due soon",
    };
  }

  return {
    alertStatus: "none",
    alertMessage: "",
  };
};

const createUniqueDogId = async () => {
  for (let attempt = 0; attempt < MAX_DOG_ID_RETRIES; attempt += 1) {
    const counter = await Counter.findOneAndUpdate(
      { name: "dogId" },
      { $inc: { seq: 1 } },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    );

    const dogId = `DOG-${String(counter.seq).padStart(3, "0")}`;
    const existingDog = await Dog.exists({ dogId });

    if (!existingDog) {
      return dogId;
    }
  }

  throw new Error("Unable to generate a unique dogId");
};

const ensureDogIdentity = async (dog) => {
  let shouldSave = false;
  let shouldRefreshQrCode = false;

  if (!dog.dogId) {
    dog.dogId = await createUniqueDogId();
    shouldSave = true;
    shouldRefreshQrCode = true;
  }

  const expectedQrCodeUrl = buildDogUrl(dog.dogId);

  if (!dog.qrCode || shouldRefreshQrCode) {
    dog.qrCode = await QRCode.toDataURL(expectedQrCodeUrl);
    shouldSave = true;
  }

  if (shouldSave) {
    await dog.save();
  }

  return dog;
};

const ensureQrCode = async (dog) => {
  return ensureDogIdentity(dog);
};

router.get("/", async (req, res) => {
  try {
    const dogs = await Dog.find();
    const today = new Date();
    const dogsWithQrCodes = await Promise.all(dogs.map(ensureQrCode));

    const dogsWithAlerts = dogsWithQrCodes.map((dog) => ({
      ...dog._doc,
      ...getDogAlert(dog, today),
    }));

    res.json(dogsWithAlerts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Error fetching dogs" });
  }
});

router.post("/", auth, isAuthorized, async (req, res) => {
  try {
    const dog = new Dog({
      ...req.body,
      dogId: await createUniqueDogId(),
    });
    await dog.save();

    dog.qrCode = await QRCode.toDataURL(buildDogUrl(dog.dogId));
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
    const type = req.body.type === "vaccination" ? "vaccination" : "treatment";
    const treatment = req.body.treatment?.trim() || "";
    const notes = req.body.notes?.trim() || "";
    const vaccinationDateInput = req.body.vaccinationDate;

    const dog = await Dog.findById(req.params.id);
    if (!dog) {
      return res.status(404).json({ msg: "Dog not found" });
    }

    let nextDueDate = null;
    let vaccinationDate = null;

    if (type === "vaccination") {
      if (!isValidDate(vaccinationDateInput)) {
        return res
          .status(400)
          .json({ msg: "Valid vaccinationDate is required for vaccinations" });
      }

      vaccinationDate = new Date(vaccinationDateInput);
      nextDueDate = calculateNextDueDate(vaccinationDate);

      const shouldUpdateSummaryDates =
        !dog.lastVaccinationDate ||
        vaccinationDate >= new Date(dog.lastVaccinationDate);

      if (shouldUpdateSummaryDates) {
        dog.lastVaccinationDate = vaccinationDate;
        dog.nextVaccinationDate = nextDueDate;
      }

      dog.vaccinated = true;
    } else if (!treatment && !notes) {
      return res.status(400).json({
        msg: "Treatment records require at least a treatment name or notes",
      });
    }

    dog.healthRecords.push({
      type,
      vaccinationDate,
      nextDueDate,
      treatment: treatment || undefined,
      notes: notes || undefined,
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
    await Promise.all(dogs.map(ensureDogIdentity));

    const alerts = dogs.map((dog) => {
      const { alertStatus, alertMessage } = getDogAlert(dog, today);
      return {
        dogId: dog.dogId,
        mongoId: dog._id,
        name: dog.name,
        status: alertStatus === "none" ? "safe" : alertStatus,
        message: alertMessage,
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

    const stats = dogs.reduce(
      (accumulator, dog) => {
        accumulator.totalDogs += 1;

        if (dog.vaccinated) {
          accumulator.vaccinatedCount += 1;
        }

        accumulator.activeReports += dog.reports.length;

        const vaccinationStatus = getVaccinationStatus(dog, today);

        if (vaccinationStatus === "overdue") {
          accumulator.overdueVaccinations += 1;
        } else if (vaccinationStatus === "dueSoon") {
          accumulator.dueSoonVaccinations += 1;
        } else {
          accumulator.safeVaccinations += 1;
        }

        return accumulator;
      },
      {
        totalDogs: 0,
        vaccinatedCount: 0,
        overdueVaccinations: 0,
        dueSoonVaccinations: 0,
        safeVaccinations: 0,
        activeReports: 0,
      }
    );

    res.json(stats);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Error fetching stats" });
  }
});

router.get("/dogid/:dogId", async (req, res) => {
  try {
    const dog = await Dog.findOne({ dogId: req.params.dogId?.trim().toUpperCase() });

    if (!dog) {
      return res.status(404).json({ msg: "Dog not found" });
    }

    await ensureDogIdentity(dog);

    res.json(dog);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Error fetching dog" });
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
