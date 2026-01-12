const http = require("http");
const WebSocket = require("ws");
const session = require('express-session');

require("dotenv").config();

// Fail fast if the session secret is not configured
if (!process.env.SESSION_SECRET) {
    console.error("FATAL ERROR: SESSION_SECRET is not defined in your .env file.");
    process.exit(1);
}

const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const sanitizeHtml = require('sanitize-html');
const app = express();

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Session Configuration
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // Use 'auto' if your setup supports it, or handle proxy
    sameSite: 'lax'
  }
}));

wss.on("connection", (ws) => {
  console.log('WSS: Client connected.');
  ws.on("message", (message) => {
    console.log("received: %s", message);
  });
  ws.on('close', () => {
    console.log('WSS: Client disconnected.');
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

// --- NEW AUTH LOGIC ---

app.post('/api/login', (req, res) => {
    const { apiKey, rememberMe } = req.body;
    let role = null;

    if (apiKey === process.env.PRIVATE_KEY) {
        role = 'edit';
    } else if (apiKey === process.env.PUBLIC_KEY) {
        role = 'view';
    }

    if (role) {
        req.session.role = role;
        if (rememberMe) {
            // Set a persistent cookie (e.g., 30 days)
            req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
        }
        // Otherwise, it's a session cookie that expires on browser close
        res.json({ success: true, role: role });
    } else {
        res.status(401).json({ success: false, message: 'Invalid API Key' });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Could not log out.' });
        }
        res.clearCookie('connect.sid'); // The default session cookie name
        res.json({ success: true });
    });
});

app.get('/api/session', (req, res) => {
    if (req.session && req.session.role) {
        res.json({ loggedIn: true, role: req.session.role });
    } else {
        res.json({ loggedIn: false, role: null });
    }
});

const checkSession = (req, res, next) => {
    if (req.session && req.session.role) {
        return next();
    }
    res.status(403).json({ success: false, message: 'Unauthorized' });
};

const checkEditAccess = (req, res, next) => {
    if (req.session && req.session.role === 'edit') {
        return next();
    }
    res.status(403).json({ success: false, message: 'Forbidden' });
};


// --- DATABASE ---
const db = {
  get: () => inMemoryPosts, // Read from memory
  save: (file, data) => {
    inMemoryPosts = data; // Update memory
    fs.writeFileSync(file, JSON.stringify(data, null, 2)); // Write to disk
  },
};

// Load initial posts into memory
let inMemoryPosts = JSON.parse(fs.existsSync('posts.json') ? fs.readFileSync('posts.json', 'utf8') : '[]');

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'templates', 'index.html'));
});

// --- API ROUTES ---

app.get("/api/posts", checkSession, (req, res) => {
  const allPosts = db.get();
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

  res.json({
    posts,
    isEdit: req.session.role === 'edit',
    hasOlder,
    hasNewer,
    page,
  });
});

app.post("/api/upload", checkEditAccess, upload.single("image"), (req, res) => {
  res.json({ success: true, url: `/uploads/${req.file.filename}` });
});

app.post("/api/posts", checkEditAccess, (req, res) => {
  const posts = db.get();
  const sanitizedText = sanitizeHtml(req.body.text, {
    allowedTags: [],
    allowedAttributes: {},
  });
  const newPost = {
    text: sanitizedText,
    timestamp: new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
  };
  posts.unshift(newPost);
  db.save("posts.json", posts);

  console.log(`WSS: Broadcasting new post to ${wss.clients.size} clients.`);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(newPost));
    }
  });

  res.json({ success: true });
});

server.listen(3000, () => console.log("Journal running on port 3000"));
