const http = require("http");
const WebSocket = require("ws");

require("dotenv").config();
const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const generateHTML = require("./app.js");
const app = express();

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
  ws.on("message", (message) => {
    console.log("received: %s", message);
  });
});

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "public/uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

app.use(express.json());
app.use(express.static("public"));

// Error handling for Multer
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "File too large. Maximum 5MB allowed.",
      });
    }
  }
  next(err);
});

const checkAuth = (req, res, next) => {
  const key = req.query.key || req.headers["x-api-key"];
  if (key === process.env.PRIVATE_KEY) {
    req.isEdit = true;
    next();
  } else if (key === process.env.PUBLIC_KEY) {
    req.isEdit = false;
    if (req.method === "POST") {
      return res.status(403).send("Unauthorized");
    }
    next();
    } else {
        const errorPage = fs.readFileSync(path.join(__dirname, 'public', 'templates', '403.html'), 'utf8');
        res.status(403).send(errorPage);
    }
};

const db = {
  get: (file) =>
    JSON.parse(fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "[]"),
  save: (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2)),
};

app.get("/", checkAuth, (req, res) => {
  const allPosts = db.get("posts.json");
  const postsPerPage = 10;
  const totalPages = Math.ceil(allPosts.length / postsPerPage);
  let page = parseInt(req.query.page || "1", 10);

  // Ensure page is within bounds
  if (page < 1) page = 1;
  if (page > totalPages && totalPages > 0) page = totalPages;
  if (totalPages === 0) page = 1; // Handle case with no posts

  const start = (page - 1) * postsPerPage;
  const end = start + postsPerPage;
  const posts = allPosts.slice(start, end);

  const hasOlder = end < allPosts.length;
  const hasNewer = page > 1;

  res.send(
    generateHTML(posts, req.query.key, req.isEdit, hasOlder, hasNewer, page)
  );
});

app.post("/api/upload", checkAuth, upload.single("image"), (req, res) => {
  res.json({ success: true, url: `/uploads/${req.file.filename}` });
});

app.post("/api/posts", checkAuth, (req, res) => {
  const posts = db.get("posts.json");
  const newPost = {
    text: req.body.text,
    timestamp: new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
  };
  posts.unshift(newPost);
  db.save("posts.json", posts);

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(newPost));
    }
  });

  res.json({ success: true });
});

server.listen(3000, () => console.log("Journal running on port 3000"));
