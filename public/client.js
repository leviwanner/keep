// Register the service worker if available in the browser.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js");
  });
}

// --- GLOBAL STATE ---

// Initialize the current page number from the URL parameters.
const urlParams = new URLSearchParams(window.location.search);
let currentPage = parseInt(urlParams.get("page") || "1", 10);
// To store the user's role (e.g., 'edit' or 'view').
let currentUserRole = null;

// --- APPLICATION INITIALIZATION ---

// Main function to initialize the application.
async function initializeApp() {
  try {
    // Check the user's session status with the server.
    const res = await fetch("/api/session");
    const data = await res.json();
    // If the user is logged in, set up the main application.
    if (data.loggedIn) {
      currentUserRole = data.role;
      document
        .querySelector(".link-logout")
        .addEventListener("click", async (e) => {
          e.preventDefault();
          await fetch("/api/logout", { method: "POST" });
          window.location.reload(); // Reload the page to show the login screen.
        });
      await fetchAndRenderPosts(currentPage); // Fetch and display posts.
      setupWebSocket(); // Establish a WebSocket connection.
    } else {
      // If the user is not logged in, display the login form.
      renderLogin();
    }
  } catch (error) {
    console.error("Could not verify session", error);
    renderLogin(); // Fallback to login form on error.
  }
}

// Renders the login form.
function renderLogin() {
  const container = document.querySelector(".container");
  container.innerHTML = `
              <h1>Space Closed</h1>
              <p>This space is personal and intentional.</p>
              <p>Nothing is wrong.<br />You've just reached a private page.</p>
              <form class="login-form" id="loginForm">
                <div class="login-key">
                  <input type="password" class="input-password" id="apiKeyInput" placeholder="If you have a key, enter it here." required>
                  <button type="submit" class="btn">Open</button>
                </div>
                <label class="checkbox-container">
                  <input type="checkbox" id="rememberMe" class="checkbox-input" checked>
                  <span>Keep space open</span>
                </label>
              </form>
      `;
  // Add an event listener for the login form submission.
  document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const apiKey = document.getElementById("apiKeyInput").value;
    const rememberMe = document.getElementById("rememberMe").checked;

    try {
      // Send the login request to the server.
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, rememberMe }),
      });

      if (res.ok) {
        // If login is successful, reload the page.
        window.location.reload();
      } else {
        alert("Login failed: Invalid Key");
      }
    } catch (error) {
      alert("Login failed: Server error");
    }
  });
}

// --- RENDERING LOGIC ---

// Fetches posts from the server and triggers the rendering process.
async function fetchAndRenderPosts(page) {
  try {
    const res = await fetch(`/api/posts?page=${page}`);
    if (!res.ok) throw new Error("Failed to fetch posts");

    const data = await res.json();
    renderApp(data); // Render the application with the fetched data.
  } catch (error) {
    console.error("Error fetching posts:", error);
  }
}

// Renders the main application components (form, feed, pagination).
function renderApp(data) {
  window.scrollTo(0, 0);
  const postForm = document.getElementById("postForm");
  // Display the post creation form only if the user has "edit" rights.
  if (data.isEdit && postForm) {
    postForm.innerHTML = `
          <input type="text" id="postInput" class="input-text" placeholder="What's on your mind?" required aria-label="Post content">
          <button type="submit" class="btn">Share</button>
          `;
    setupFormEventListeners(); // Set up event listeners for the form.
  } else if (postForm) {
    postForm.innerHTML = ""; // Clear the form container if not in edit mode.
  }

  // Render the feed of posts.
  const feed = document.getElementById("feed");
  if (feed) {
    feed.innerHTML = data.posts.map(createPostElement).join("");
  }

  // Render the pagination controls.
  let paginationContainer = document.getElementById("pagination");
  if (data.hasOlder || data.hasNewer) {
    if (!paginationContainer) {
      paginationContainer = document.createElement("nav");
      paginationContainer.id = "pagination";
      paginationContainer.className = "pagination";
      const footer = document.querySelector(".footer-nav");
      footer.parentNode.insertBefore(paginationContainer, footer);
    }
    const prevLink = data.hasNewer
      ? `<button class="btn" id="previous">Previous</button>`
      : "<div></div>";
    const nextLink = data.hasOlder
      ? `<button class="btn" id="next">Next</button>`
      : "<div></div>";
    const spacer = `<div class="pagination-spacer" role="presentation"></div>`;
    paginationContainer.innerHTML = `
          ${prevLink}
          ${spacer}
          ${nextLink}
        `;
    setupPaginationEventListeners(data);
  } else if (paginationContainer) {
    paginationContainer.remove();
  }
}

// --- EVENT LISTENERS & DOM MANIPULATION ---

// Sets up event listeners for the post creation form.
function setupFormEventListeners() {
  const postForm = document.getElementById("postForm");
  const postInput = document.getElementById("postInput");
  if (!postForm || !postInput) return;

  postForm.addEventListener("submit", submitPost);
  postInput.addEventListener("paste", handlePaste);

  // Resets the placeholder text on focus.
  postInput.addEventListener("focus", () => {
    postInput.placeholder = "What's on your mind?";
  });

  // Resets the placeholder text on input, in case of a previous error message.
  postInput.addEventListener("input", () => {
    if (postInput.placeholder.includes("failed")) {
      postInput.placeholder = "What's on your mind?";
    }
  });
}

// Sets up event listeners for the pagination controls.
function setupPaginationEventListeners(data) {
  const prevButton = document.getElementById("previous");
  if (prevButton) {
    prevButton.addEventListener("click", (e) => {
      e.preventDefault();
      currentPage = data.page - 1;
      fetchAndRenderPosts(currentPage);
      // Update the URL to reflect the new page number.
      history.pushState({ page: currentPage }, "", `/?page=${currentPage}`);
    });
  }

  const nextButton = document.getElementById("next");
  if (nextButton) {
    nextButton.addEventListener("click", (e) => {
      e.preventDefault();
      currentPage = data.page + 1;
      fetchAndRenderPosts(currentPage);
      // Update the URL to reflect the new page number.
      history.pushState({ page: currentPage }, "", `/?page=${currentPage}`);
    });
  }
}

// Handles the submission of a new post.
async function submitPost(e) {
  e.preventDefault();
  const input = document.getElementById("postInput");
  const text = input.value;
  if (!text) return;

  try {
    const res = await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (res.ok) {
      input.value = ""; // Clear the input field on successful submission.
    } else {
      console.error("Post submission failed");
    }
  } catch (error) {
    console.error("Post submission failed:", error);
  }
}

// Handles pasting content into the post input, specifically for uploading images.
async function handlePaste(e) {
  const items = (e.clipboardData || e.originalEvent.clipboardData).items;
  for (const item of items) {
    if (item.type.indexOf("image") === 0) {
      e.preventDefault();
      const blob = item.getAsFile();
      const formData = new FormData();
      formData.append("image", blob);

      try {
        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (res.ok && data.success) {
          // If upload is successful, populate the input field with the image URL.
          document.getElementById("postInput").value =
            window.location.origin + data.url;
        } else {
          // Handle upload failure by displaying a message in the placeholder.
          console.error("Upload failed:", data.message);
          const postInput = document.getElementById("postInput");
          if (postInput) {
            postInput.value = "";
            postInput.placeholder =
              data.message || "Upload failed. Please try again.";
          }
        }
      } catch (error) {
        console.error("Image upload failed:", error);
      }
    }
  }
}

// Creates the HTML element for a single post.
function createPostElement(post) {
  // Check if the post text is an image URL.
  const isImage =
    post.text.match(/\.(jpeg|jpg|gif|png|webp|avif|bmp)(\?|$)/i) != null ||
    post.text.includes("pbs.twimg.com/media/");

  // Create the appropriate HTML content for the post.
  const contentHTML = isImage
    ? `<a href="${post.text}" target="_blank"><img src="${post.text}" alt="Thought image" loading="lazy"></a>`
    : post.text.includes("http")
    ? `<a href="${post.text}" target="_blank">${post.text}</a>`
    : post.text;

  // Return the complete HTML structure for the post.
  return `
          <article class="feed-item">
            <div class="feed-content">${contentHTML}</div>
            <time class="feed-date" datetime="${post.isoTimestamp}">${post.timestamp}</time>
          </article>`;
}

// --- WEBSOCKETS ---

// Sets up the WebSocket connection and defines its event handlers.
function setupWebSocket() {
  const wsProtocol = window.location.protocol === "https:" ? "wss://" : "ws://";
  const ws = new WebSocket(`${wsProtocol}${window.location.host}`);

  // Handle incoming messages from the WebSocket server.
  ws.onmessage = (event) => {
    // If a new post is received and the user is on the first page,
    // refresh the posts to ensure the view and pagination are up-to-date.
    if (currentPage === 1) {
      fetchAndRenderPosts(currentPage);
    }
  };

  // Handle the WebSocket connection closing.
  ws.onclose = () => {
    console.log("WebSocket disconnected. Attempting to reconnect...");
    // Attempt to reconnect after a 3-second delay.
    setTimeout(setupWebSocket, 3000);
  };

  // Handle WebSocket errors.
  ws.onerror = (err) => {
    console.error("WS: WebSocket error:", err);
  };
}

// --- PAGE LOAD & BROWSER HISTORY ---

// Initial setup when the DOM is fully loaded.
document.addEventListener("DOMContentLoaded", () => {
  initializeApp();

  // Add a global click listener to improve UI on mobile devices.
  document.addEventListener("click", (event) => {
    // If the user clicks on a non-interactive area, remove focus from the active element.
    // This is useful for dismissing virtual keyboards on mobile.
    if (!event.target.closest("input, button, a, [onclick]")) {
      if (document.activeElement) {
        document.activeElement.blur();
      }
    }
  });

  // --- Page Visibility API ---
  // Listen for changes in document visibility to refresh posts when the app comes to foreground.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      console.log("App has come to foreground, refreshing posts.");
      fetchAndRenderPosts(currentPage);
    }
  });
});

// Handle browser back/forward buttons
window.addEventListener("popstate", (event) => {
  const urlParams = new URLSearchParams(window.location.search);
  const pageFromUrl = parseInt(urlParams.get("page") || "1", 10);

  // If the page number in the URL has changed, fetch and render the posts for the new page.
  if (pageFromUrl !== currentPage) {
    currentPage = pageFromUrl;
    fetchAndRenderPosts(currentPage);
  }
});
