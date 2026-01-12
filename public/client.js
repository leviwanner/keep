if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js");
  });
}

// Initialize currentPage from the URL
const urlParams = new URLSearchParams(window.location.search);
let currentPage = parseInt(urlParams.get("page") || "1", 10);
let currentUserRole = null;

// --- Main App Logic ---

async function initializeApp() {
  try {
    const res = await fetch("/api/session");
    const data = await res.json();
    if (data.loggedIn) {
      currentUserRole = data.role;
      renderMainLayout(); // Render the main app structure
      await fetchAndRenderPosts(currentPage);
      setupWebSocket();
    } else {
      renderLogin();
    }
  } catch (error) {
    console.error("Could not verify session", error);
    renderLogin();
  }
}

// Function to render the overall app structure (called once on login/session check)
function renderMainLayout() {
  const container = document.querySelector(".container");
  container.innerHTML = `
        <div id="form-container"></div>
        <div id="feed"></div>
        <div id="archive-container"></div>
        <div id="logout-container" style="text-align: center; margin-top: 20px;">
            <a href="#" id="logout">Close space</a>
        </div>
    `;
  // Attach event listener for the logout button only once
  document.getElementById("logout").addEventListener("click", async (e) => {
    e.preventDefault();
    await fetch("/api/logout", { method: "POST" });
    renderLogin();
  });
}

function renderLogin() {
  const container = document.querySelector(".container");
  container.innerHTML = `
        <div class="login-container">
            <h1>Space Closed</h1>
            <p>This space is personal and intentional.</p>
            <p>Nothing is wrong.<br />You've just reached a private page.</p>
            <form id="loginForm">
                <div class="login-key">
                    <input type="password" id="apiKeyInput" placeholder="If you have a key, enter it here." required />
                    <button type="submit">Open</button>
                </div>
                <div class="remember-me">
                    <label class="checkbox">
                        <input type="checkbox" id="rememberMe" checked>
                        <span>Keep space open</span>
                    </label>
                </div>
            </form>
        </div>
    `;
  document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const apiKey = document.getElementById("apiKeyInput").value;
    const rememberMe = document.getElementById("rememberMe").checked;

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, rememberMe }),
      });

      if (res.ok) {
        const data = await res.json();
        currentUserRole = data.role;
        renderMainLayout(); // Render the main app structure
        await fetchAndRenderPosts(currentPage);
        setupWebSocket();
      } else {
        alert("Login failed: Invalid Key");
      }
    } catch (error) {
      alert("Login failed: Server error");
    }
  });
}

async function fetchAndRenderPosts(page) {
  try {
    const res = await fetch(`/api/posts?page=${page}`);
    if (!res.ok) throw new Error("Failed to fetch posts");

    const data = await res.json();
    renderApp(data);
  } catch (error) {
    console.error("Error fetching posts:", error);
  }
}

function renderApp(data) {
  const formContainer = document.getElementById("form-container");
  if (data.isEdit && formContainer) {
    formContainer.innerHTML = `
            <form id="postForm">
                <input type="text" id="postInput" placeholder="What's on your mind?" required />
                <button type="submit">Share</button>
            </form>
        `;
    setupFormEventListeners();
  } else if (formContainer) {
    formContainer.innerHTML = ""; // Clear form container if not in edit mode
  }

  const feed = document.getElementById("feed");
  if (feed) {
    feed.innerHTML = data.posts.map(createPostElement).join("");
  }

  // Render pagination
  const archiveContainer = document.getElementById("archive-container");
  if (archiveContainer) {
    // Determine if we need to display the archive bar at all
    if (data.hasOlder || data.hasNewer) {
      // Use empty placeholders (<div></div>) if a link isn't present
      // to maintain the 3-column grid structure.
      const olderLink = data.hasOlder
        ? `<a href="#" id="older">Older</a>`
        : "<div></div>";
      const newerLink = data.hasNewer
        ? `<a href="#" id="newer">Newer</a>`
        : "<div></div>";
      const spacer = `<div class="spacer"></div>`;
      // Reconstruct the innerHTML with the spacer always in the middle
      archiveContainer.innerHTML = `
        <div class="archive">
          ${olderLink}
          ${spacer}
          ${newerLink}
        </div>`;
    } else {
      // Remove the bar entirely if no pagination is needed
      archiveContainer.innerHTML = "";
    }
    setupPaginationEventListeners(data);
  }
}

// --- Event Listeners & Element Creation ---

function setupFormEventListeners() {
  const postForm = document.getElementById("postForm");
  const postInput = document.getElementById("postInput");
  if (!postForm || !postInput) return;

  postForm.addEventListener("submit", submitPost);
  postInput.addEventListener("paste", handlePaste);

  // Re-add listeners to manage placeholder text
  postInput.addEventListener("focus", () => {
    postInput.placeholder = "What's on your mind?";
  });

  postInput.addEventListener("input", () => {
    if (postInput.placeholder.includes("failed")) {
      postInput.placeholder = "What's on your mind?";
    }
  });
}

function setupPaginationEventListeners(data) {
  const olderButton = document.getElementById("older");
  if (olderButton) {
    olderButton.addEventListener("click", (e) => {
      e.preventDefault();
      currentPage = data.page + 1;
      fetchAndRenderPosts(currentPage);
      // Update URL without reloading
      history.pushState({ page: currentPage }, "", `/?page=${currentPage}`);
    });
  }

  const newerButton = document.getElementById("newer");
  if (newerButton) {
    newerButton.addEventListener("click", (e) => {
      e.preventDefault();
      currentPage = data.page - 1;
      fetchAndRenderPosts(currentPage);
      // Update URL without reloading
      history.pushState({ page: currentPage }, "", `/?page=${currentPage}`);
    });
  }
}

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
      input.value = "";
    } else {
      console.error("Post submission failed");
    }
  } catch (error) {
    console.error("Post submission failed:", error);
  }
}

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
          document.getElementById("postInput").value =
            window.location.origin + data.url;
        } else {
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

function createPostElement(post) {
  const isImage =
    post.text.match(/\.(jpeg|jpg|gif|png|webp|avif|bmp)(\?|$)/i) != null ||
    post.text.includes("pbs.twimg.com/media/");
  const content = isImage
    ? `<a href="${post.text}" target="_blank"><img src="${post.text}" loading="lazy"></a>`
    : post.text.includes("http")
    ? `<a href="${post.text}" target="_blank">${post.text}</a>`
    : post.text;

  return `
        <div class="item">
            <div class="subject">
                <div class="content">${content}</div>
                <div class="date">${post.timestamp}</div>
            </div>
        </div>`;
}

// --- WebSocket Logic ---

function setupWebSocket() {
  const wsProtocol = window.location.protocol === "https:" ? "wss://" : "ws://";
  const ws = new WebSocket(`${wsProtocol}${window.location.host}`);

  ws.onmessage = (event) => {
    if (currentPage === 1) {
      const post = JSON.parse(event.data);
      const feed = document.getElementById("feed");
      if (feed) {
        feed.insertAdjacentHTML("afterbegin", createPostElement(post));
        if (feed.children.length > 10) {
          feed.lastChild.remove();
        }
      }
    }
  };

  ws.onclose = () => {
    console.log("WebSocket disconnected. Attempting to reconnect...");
    setTimeout(setupWebSocket, 3000);
  };

  ws.onerror = (err) => {
    console.error("WS: WebSocket error:", err);
  };
}

// --- Initial Load ---

document.addEventListener("DOMContentLoaded", initializeApp);

// Handle browser back/forward buttons
window.addEventListener("popstate", (event) => {
  const urlParams = new URLSearchParams(window.location.search);
  const pageFromUrl = parseInt(urlParams.get("page") || "1", 10);

  if (pageFromUrl !== currentPage) {
    currentPage = pageFromUrl;
    fetchAndRenderPosts(currentPage);
  }
});
