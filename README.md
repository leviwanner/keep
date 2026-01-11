# Keep Journal PWA

## Project Overview

"Keep Journal" is a simple, private Progressive Web Application (PWA) designed for journaling. It allows users to quickly jot down thoughts, URLs, and even paste images, all accessible and manageable via a web interface. The application supports real-time updates across multiple connected clients (e.g., browser windows) and features pagination for easy navigation through entries. It also implements an "edit" and "view" key system for access control, ensuring privacy for your thoughts.

## Features

- **Private Journaling:** Keep your thoughts secure with key-based access.
- **Real-time Updates:** New posts appear instantly across all connected browser sessions without full page reloads.
- **Image Pasting & Upload:** Directly paste images from your clipboard into the input field. Images are automatically uploaded and displayed.
- **URL Detection:** URLs in your posts automatically become clickable links.
- **Image Rendering:** Image URLs are rendered directly in the feed, with a grayscale-to-color hover effect.
- **Pagination:** Navigate through your journal entries with "Older" and "Newer" buttons, displaying 10 posts per page. Invalid page numbers automatically default to the last available page.
- **Edit/View Access Control:**
  - **Edit Key:** Allows posting new entries, uploading images, and full interaction.
  - **View Key:** Provides read-only access to the journal.
- **PWA Installability:** Installable as a standalone application on supported devices (mobile and desktop).
- **Clear Project Structure:** Separated HTML templates, CSS styles, and client-side JavaScript for maintainability.

## Local Development Setup

To get the Keep Journal PWA up and running on your local machine, follow these steps:

### 1. Clone the repository (if applicable)

If you have this project in a Git repository:

```bash
git clone <your-repo-url>
cd keep-journal
```

Otherwise, navigate to your project directory:

```bash
cd keep-journal
```

### 2. Install Dependencies

Install all necessary Node.js packages listed in `package.json`:

```bash
npm install
```

### 3. Environment Configuration (`.env`)

Create a `.env` file in the root of your project to store your secret keys and other environment-specific variables. A `.env.example` file is provided as a template; copy its contents to a new file named `.env` and fill in your actual values.

```bash
cp .env.example .env
```

You'll need to generate VAPID keys for potential future push notification functionality, even if not actively used right now.

**Generate VAPID Keys (if needed for future notification features):**

```bash
npx web-push generate-vapid-keys
```

This will output a public and private key. Copy them into your `.env` file if you plan to enable notifications.

Your `.env` file should eventually look like this (with your actual secrets):

```plaintext
PRIVATE_KEY=YOUR_SUPER_SECRET_EDIT_KEY
PUBLIC_KEY=YOUR_SUPER_SECRET_VIEW_KEY
# VAPID_PUBLIC=PASTE_GENERATED_VAPID_PUBLIC_KEY_HERE
# VAPID_PRIVATE=PASTE_GENERATED_VAPID_PRIVATE_KEY_HERE
```

**Remember to replace `YOUR_SUPER_SECRET_EDIT_KEY` and `YOUR_SUPER_SECRET_VIEW_KEY` with strong, unique keys of your choice. I recommend using a tool like this [password generator](https://1password.com/password-generator)**

### 4. Ensure Uploads Directory is Available

Create a `uploads` directory to store user-uploaded images and other media files.
This directory must exist and be writable by the application at runtime.

```bash
mkdir -p keep/public/uploads
```

**Notes:**

- The `uploads` directory is served as a public static path.
- Ensure proper write permissions for the server process.

### 5. Project Structure (Overview)

```
keep-journal/
├── public/
│   ├── client.js          # Client-side JavaScript logic
│   ├── manifest.json      # PWA manifest configuration
│   ├── sw.js              # Service Worker (for caching and PWA features)
│   ├── styles/
│   │   └── style.css      # Application styles
│   ├── templates/
│   │   └── index.html     # HTML template
│   └── uploads/           # Image storage
├── app.js                 # HTML generation logic (server-side)
├── posts.json             # Flat-file database for posts
├── server.js              # Express server, API endpoints, WebSocket server
└── .env                   # Environment variables (keys, VAPID)
```

### 6. Start the Server

```bash
node server.js
```

The server will start on `http://localhost:3000`.

## Usage

### Accessing the Journal

- **Edit Access:** Navigate to `http://localhost:3000/?key=YOUR_SUPER_SECRET_EDIT_PASSWORD`
- **View-Only Access:** Navigate to `http://localhost:3000/?key=YOUR_SUPER_SECRET_VIEW_PASSWORD`

Replace `YOUR_SUPER_SECRET_EDIT_PASSWORD` and `YOUR_SUPER_SECRET_VIEW_PASSWORD` with the actual keys from your `.env` file.

### Posting Entries

1.  Access the journal with your edit key.
2.  Type your message into the input field.
3.  Click "Share" or press Enter.

### Pasting Images

1.  Access the journal with your edit key.
2.  Copy an image to your clipboard (e.g., from a screenshot or another application).
3.  Paste the image directly into the input field. The image will be uploaded, and its URL will appear in the input.
4.  Click "Share" or press Enter to post the image.

### Pagination

- If there are more than 10 posts, "Older" and "Newer" buttons will appear below the feed.
- Click "Older" to navigate to the next set of older posts.
- Click "Newer" to go back to newer posts.
- Directly specify pages in the URL (e.g., `&page=2`). If the page number is out of bounds, it will default to the last available page.

## Future Enhancements / TODO

- **Implement Push Notification Logic:** Add the necessary server-side and client-side logic to deliver notifications to users for new posts. This will involve reactivating the `notify.js` module, the notification endpoints in `server.js`, and the client-side subscription/unsubscription logic.

## Preparing for Version Control

A `.gitignore` file has been provided to exclude unnecessary files and sensitive information when pushing your project to a Git repository.
