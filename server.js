// Import necessary modules for creating an HTTP server, handling WebSockets, and managing sessions.
const http = require("http");
const WebSocket = require("ws");
const session = require("express-session");
const FileStore = require("session-file-store")(session); // Add this line

// Load environment variables from a .env file for configuration.
require("dotenv").config();

// Fail fast if the session secret is not configured, ensuring the application is secure.
if (!process.env.SESSION_SECRET) {
  console.error(
    "FATAL ERROR: SESSION_SECRET is not defined in your .env file."
  );
  process.exit(1);
}

// Import additional modules for building the Express application.
const express = require("express");
const multer = require("multer"); // For handling file uploads.
const fs = require("fs"); // For interacting with the file system.
const path = require("path"); // For handling file and directory paths.
const sanitizeHtml = require("sanitize-html"); // For cleaning up user-submitted HTML.

// Initialize the Express application and create an HTTP server.
const app = express();
const server = http.createServer(app);

// Initialize a WebSocket server and attach it to the HTTP server.
const wss = new WebSocket.Server({ server });

// Configure session management for the Express app, using a file-based store.
const fileStoreOptions = {};
app.use(
  session({
    store: new FileStore(fileStoreOptions), // Use session-file-store for persistence.
    secret: process.env.SESSION_SECRET, // A secret key for signing the session ID cookie.
    resave: false, // Don't save session if unmodified.
    saveUninitialized: false, // Don't create session until something stored.
    cookie: {
      httpOnly: true, // Prevent client-side JS from accessing the cookie.
      secure: process.env.NODE_ENV === "production", // Use secure cookies in production.
      sameSite: "lax", // A balanced approach to CSRF protection.
    },
  })
);

// Handle new WebSocket connections.
wss.on("connection", (ws) => {
  console.log("WSS: Client connected.");
  // Handle incoming messages from clients.
  ws.on("message", (message) => {
    console.log("received: %s", message);
  });
  // Handle WebSocket client disconnection.
  ws.on("close", () => {
    console.log("WSS: Client disconnected.");
  });
});

// Configure storage for uploaded files using Multer.
const storage = multer.diskStorage({
  // Set the destination directory for uploaded files.
  destination: function (req, file, cb) {
    cb(null, "public/uploads/");
  },
  // Set the filename for uploaded files, adding a timestamp to ensure uniqueness.
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

// Configure Multer with the defined storage and file size limits.
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

// Use Express middleware to parse JSON bodies and serve static files from the "public" directory.
app.use(express.json());
app.use(express.static("public"));

// Custom error handling middleware for Multer errors.
app.use((err, req, res, next) => {
  // Check if the error is a Multer error.
  if (err instanceof multer.MulterError) {
    // Handle the specific error for files that are too large.
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "File too large. Maximum 5MB allowed.",
      });
    }
  }
  // Pass other errors to the next middleware.
  next(err);
});

// --- AUTHENTICATION ---

// API endpoint for user login.
app.post("/api/login", (req, res) => {
  const { apiKey, rememberMe } = req.body;
  let role = null;

  // Determine the user's role based on the provided API key.
  if (apiKey === process.env.PRIVATE_KEY) {
    role = "edit";
  } else if (apiKey === process.env.PUBLIC_KEY) {
    role = "view";
  }

  if (role) {
    // Store the user's role in the session.
    req.session.role = role;
    // If "remember me" is checked, set a persistent cookie.
    if (rememberMe) {
      req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
    }
    // Respond with success and the user's role.
    res.json({ success: true, role: role });
  } else {
    // Respond with an error for invalid API keys.
    res.status(401).json({ success: false, message: "Invalid API Key" });
  }
});

// API endpoint for user logout.
app.post("/api/logout", (req, res) => {
  // Destroy the user's session.
  req.session.destroy((err) => {
    if (err) {
      return res
        .status(500)
        .json({ success: false, message: "Could not log out." });
    }
    // Clear the session cookie.
    res.clearCookie("connect.sid");
    res.json({ success: true });
  });
});

// API endpoint to check the current session status.
app.get("/api/session", (req, res) => {
  // Check if a session exists and has a role.
  if (req.session && req.session.role) {
    res.json({ loggedIn: true, role: req.session.role });
  } else {
    res.json({ loggedIn: false, role: null });
  }
});

// Middleware to protect routes by checking for a valid session.
const checkSession = (req, res, next) => {
  if (req.session && req.session.role) {
    return next(); // Continue to the next middleware if the session is valid.
  }
  // Respond with an error if the session is not valid.
  res.status(403).json({ success: false, message: "Unauthorized" });
};

// Middleware to protect routes by checking for "edit" access rights.
const checkEditAccess = (req, res, next) => {
  if (req.session && req.session.role === "edit") {
    return next(); // Continue if the user has edit access.
  }
  // Respond with an error if the user does not have edit access.
  res.status(403).json({ success: false, message: "Forbidden" });
};

// --- DATABASE ---

// A simple in-memory database object with methods to get and save posts.
const db = {
  // Returns the current array of posts from memory.
  get: () => inMemoryPosts,
  // Updates the in-memory posts and writes them to a JSON file.
  save: (file, data) => {
    inMemoryPosts = data;
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  },
};

// Load initial posts from "posts.json" into the in-memory store on server start.
let inMemoryPosts = JSON.parse(
  fs.existsSync("posts.json") ? fs.readFileSync("posts.json", "utf8") : "[]"
);

// --- ROUTES ---

// Serve the main application page.
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "templates", "index.html"));
});

// --- API ROUTES ---

// API endpoint to get posts with pagination.
app.get("/api/posts", checkSession, (req, res) => {
  const allPosts = db.get();
  const postsPerPage = 10;
  const totalPages = Math.ceil(allPosts.length / postsPerPage);
  let page = parseInt(req.query.page || "1", 10);

  // Ensure the requested page number is within valid bounds.
  if (page < 1) page = 1;
  if (page > totalPages && totalPages > 0) page = totalPages;
  if (totalPages === 0) page = 1;

  // Calculate the start and end indices for the requested page.
  const start = (page - 1) * postsPerPage;
  const end = start + postsPerPage;
  const posts = allPosts.slice(start, end);

  // Determine if there are older or newer posts for pagination links.
  const hasOlder = end < allPosts.length;
  const hasNewer = page > 1;

  // Respond with the posts for the page and pagination metadata.
  res.json({
    posts,
    isEdit: req.session.role === "edit",
    hasOlder,
    hasNewer,
    page,
  });
});

// API endpoint to handle file uploads.
app.post("/api/upload", checkEditAccess, upload.single("image"), (req, res) => {
  // Respond with the URL of the uploaded file.
  res.json({ success: true, url: `/uploads/${req.file.filename}` });
});

// API endpoint to create a new post.
app.post("/api/posts", checkEditAccess, (req, res) => {
  const posts = db.get();
  // Sanitize the post text to prevent XSS attacks.
  const sanitizedText = sanitizeHtml(req.body.text, {
    allowedTags: [],
    allowedAttributes: {},
  });
  // Create a new post object.
  const newPost = {
    text: sanitizedText,
    timestamp: new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    isoTimestamp: new Date().toISOString(),
  };
  // Add the new post to the beginning of the array.
  posts.unshift(newPost);
  // Save the updated posts array.
  db.save("posts.json", posts);

  // Broadcast the new post to all connected WebSocket clients.
  console.log(`WSS: Broadcasting new post to ${wss.clients.size} clients.`);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(newPost));
    }
  });

  res.json({ success: true });
});

// Start the HTTP server and listen for incoming requests on the specified port.
server.listen(3000, () => console.log("Journal running on port 3000"));
