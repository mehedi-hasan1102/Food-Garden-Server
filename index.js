const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cookieParser());

app.use(
  cors({
    origin: ["https://food-garden-bd.web.app",'http://localhost:5173'],
    credentials: true,
  })
);
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hellow World ! ");
});

// MongoDB URI (local)

const uri = `mongodb+srv://${process.env.NAME}:${process.env.PASS}@cluster0.onrfrlh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

//middleware
const verifyToken = (req, res, next) => {
  const token = req.cookies.token;
  if (!token)
    return res.status(401).json({ message: "Unauthorized, No cookies found" });
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ message: "Token parsing failed" });
    next();
  });
};

app.post("/jwt", async (req, res) => {
  const { email } = req.body;
  const user = { email };
  const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: "2h" });
  res.cookie("token", token, {
    httpOnly: true,
    secure: true,
    sameSite:'none'
  });
  res.send({ message: "token sent", status: true });
});

app.post("/logout", (req, res) => {
  res.clearCookie("session", {
    httpOnly: true,
    path: "/",
    secure: true,
    sameSite: "none",
  })})

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect to MongoDB
    // await client.connect();

    // Reference to the foods collection
    const foods = client.db("foodsdb").collection("foods");

    // Get all food items
    app.get("/foods", async (req, res) => {
      try {
        const result = await foods.find().toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch data" });
      }
    });

    // Add new food item — requires verify token

    app.post("/foods",verifyToken, async (req, res) => {
      try {
        const newFood = req.body;
        const result = await foods.insertOne(newFood);
        res.send({
          success: true,
          message: "Food item added successfully!",
          data: result,
        });
      } catch (error) {
        res.status(500).send({ error: "Failed to add food item" });
      }
    });

    // DELETE food item by ID { i wiil add verefi tocken here }
    app.delete("/foods/:id",verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await foods.deleteOne(query);

        if (result.deletedCount === 1) {
          res.send({
            success: true,
            message: "Food item deleted successfully!",
          });
        } else {
          res.status(404).send({
            success: false,
            message: "Food item not found",
          });
        }
      } catch (error) {
        res.status(500).send({ error: "Failed to delete food item" });
      }
    });

    // UPDATE food item by ID 
    app.put("/foods/:id",verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        const updatedData = req.body;

        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: updatedData,
        };

        const result = await foods.updateOne(filter, updateDoc);

        if (result.modifiedCount === 1) {
          res.send({
            success: true,
            message: "Food item updated successfully!",
          });
        } else {
          res.status(404).send({
            success: false,
            message: "Food item not found or data is the same",
          });
        }
      } catch (error) {
        res.status(500).send({ error: "Failed to update food item" });
      }
    });

    // GET single food item by ID
    app.get("/foods/:id",verifyToken, async (req, res) => {
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

    // POST a new note to a food item  { i wiil add verefi tocken here }
    app.post("/foods/notes/:id",  async (req, res) => {
      try {
        const id = req.params.id;
        console.log(id);
        const { note, postedBy, postedAt } = req.body;

        const newNote = { note, postedBy, postedAt };
        // const result = await foods.insertOne(newFood);
        const result = await foods.updateOne(
          { _id: new ObjectId(id) },
          { $push: { notes: newNote } }
        );

        if (result.modifiedCount === 1) {
          res.send(newNote);
        } else {
          res.status(404).send({ error: "Food item not found" });
        }
      } catch (error) {
        res.status(500).send({ error: "Failed to add note" });
      }
    });

    // Confirm DB connection
    await client.db("admin").command({ ping: 1 });
    console.log("Connected to MongoDB 😍");
  } catch (error) {
    console.error("MongoDB connection error: 😭", error);
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(` Server running at http://localhost:${port} 👌`);
});