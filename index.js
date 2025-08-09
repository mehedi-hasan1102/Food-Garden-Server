require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const PORT = process.env.PORT || 5000;
const COOKIE_NAME = "token";

// Trust proxy when behind a proxy (Vercel, Heroku, Cloudflare)
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// --- Middleware ---
app.use(express.json());
app.use(cookieParser());

// Configure allowed origins
const allowedOrigins = [
  "https://project-web-b11-a11-food-garden-ser.vercel.app",
  "https://food-garden-bd.web.app",
  "http://localhost:5173",
  "http://localhost:3000",
];

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) {
        cb(null, true);
      } else {
        cb(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

// --- JWT Handling ---

/**
 * To implement refresh tokens, you would typically do the following:
 * 1. When issuing a token, also issue a long-lived refresh token.
 * 2. Store the refresh token in your database, associated with the user.
 * 3. When the access token expires, the client sends the refresh token to a new `/refresh-token` endpoint.
 * 4. The server verifies the refresh token against the database.
 * 5. If valid, the server issues a new access token and a new refresh token.
 * 6. The old refresh token is invalidated.
 * This approach provides a more secure and seamless user experience.
 */

// Cookie options helper
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  path: "/",
};

// --- JWT verify middleware ---
const verifyToken = (req, res, next) => {
  const token = req.cookies[COOKIE_NAME];

  if (!token) {
    return res.status(401).json({ ok: false, message: "Unauthorized: No token provided." });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      // Token is expired or invalid
      return res.status(401).json({ ok: false, message: "Unauthorized: Invalid token." });
    }
    req.user = decoded; // Attach user payload to the request
    next();
  });
};

// --- Auth endpoints ---

// Issue JWT cookie (login)
app.post("/jwt", (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ ok: false, message: "Email is required." });
  }

  const payload = { email };
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "2h" });

  res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: 2 * 60 * 60 * 1000 }); // 2 hours

  res.json({ ok: true, message: "Token issued successfully." });
});

// Logout - clear the JWT cookie
app.post("/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: 0 });
  res.json({ ok: true, message: "Logged out successfully." });
});

// --- MongoDB setup ---
const uri = `mongodb+srv://${process.env.NAME}:${process.env.PASS}@cluster0.onrfrlh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function main() {
  try {
    await client.connect();
    console.log("Connected to MongoDB");

    const db = client.db("foodsdb");
    const foods = db.collection("foods");

    // --- API Routes ---

    // Public: list all foods
    app.get("/foods", async (req, res) => {
      try {
        const list = await foods.find().toArray();
        res.json({ ok: true, data: list });
      } catch (err) {
        console.error("GET /foods error:", err);
        res.status(500).json({ ok: false, message: "Failed to fetch foods." });
      }
    });

    // Protected: add food
    app.post("/foods", verifyToken, async (req, res) => {
      try {
        const newFood = { ...req.body, userEmail: req.user.email, addedAt: new Date().toISOString() };
        const result = await foods.insertOne(newFood);
        res.status(201).json({ ok: true, message: "Food added successfully.", data: result });
      } catch (err) {
        console.error("POST /foods error:", err);
        res.status(500).json({ ok: false, message: "Failed to add food." });
      }
    });

    // Protected: delete food
    app.delete("/foods/:id", verifyToken, async (req, res) => {
      try {
        const { id } = req.params;
        const result = await foods.deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 1) {
          res.json({ ok: true, message: "Food deleted successfully." });
        } else {
          res.status(404).json({ ok: false, message: "Food not found." });
        }
      } catch (err) {
        console.error("DELETE /foods/:id error:", err);
        res.status(500).json({ ok: false, message: "Failed to delete food." });
      }
    });

    // Protected: update food
    app.put("/foods/:id", verifyToken, async (req, res) => {
      try {
        const { id } = req.params;
        const updatedData = req.body;
        const result = await foods.updateOne({ _id: new ObjectId(id) }, { $set: updatedData });

        if (result.modifiedCount === 1) {
            const updatedFood = await foods.findOne({ _id: new ObjectId(id) });
          res.json({ ok: true, message: "Food updated successfully.", data: updatedFood });
        } else {
          res.status(404).json({ ok: false, message: "Food not found or no changes made." });
        }
      } catch (err) {
        console.error("PUT /foods/:id error:", err);
        res.status(500).json({ ok: false, message: "Failed to update food." });
      }
    });
    
    // GET single food item by ID
    app.get("/foods/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const food = await foods.findOne({ _id: new ObjectId(id) });

        if (!food) {
          return res.status(404).send({ error: "Food not found" });
        }

        res.send(food);
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch food" });
      }
    });

    // Protected: Post a new note to a food item
    app.post("/foods/notes/:id", verifyToken, async (req, res) => {
      try {
        const { id } = req.params;
        const { note } = req.body;
        const newNote = {
          note,
          postedBy: req.user.email,
          postedAt: new Date().toISOString(),
        };

        const result = await foods.updateOne({ _id: new ObjectId(id) }, { $push: { notes: newNote } });

        if (result.modifiedCount === 1) {
          res.status(201).json({ ok: true, message: "Note added successfully.", data: newNote });
        } else {
          res.status(404).json({ ok: false, message: "Food not found." });
        }
      } catch (err) {
        console.error("POST /foods/notes/:id error:", err);
        res.status(500).json({ ok: false, message: "Failed to add note." });
      }
    });

    // --- Server Health Check ---
    app.get("/", (req, res) => {
      res.json({ ok: true, message: "Server is running." });
    });

  } catch (err) {
    console.error("MongoDB connection failed:", err);
    process.exit(1);
  }
}

main().catch(console.error);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
