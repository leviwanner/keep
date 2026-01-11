if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(registration => {
            console.log('ServiceWorker registration successful with scope: ', registration.scope);
        }, err => {
            console.log('ServiceWorker registration failed: ', err);
        });
    });
}

// Global variables for key, page, and WebSocket
const key = new URLSearchParams(window.location.search).get('key');
const page = new URLSearchParams(window.location.search).get('page') || '1';
const wsProtocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
const ws = new WebSocket(`${wsProtocol}${window.location.host}?key=${key}&page=${page}`);

ws.onmessage = event => {
    if (page === '1') {
        const post = JSON.parse(event.data);
        const postElement = createPostElement(post);
        const feed = document.getElementById('feed');
        feed.prepend(postElement);
        if (feed.children.length > 10) {
            feed.lastChild.remove();
        }
    }
};

function createPostElement(post) {
    const isImage = post.text.match(/\.(jpeg|jpg|gif|png|webp|avif|bmp)(\?|$)/i) != null || post.text.includes('pbs.twimg.com/media/');
    const content = isImage
        ? `<a href="${post.text}" target="_blank"><img src="${post.text}" loading="lazy"></a>`
        : post.text.includes('http')
            ? `<a href="${post.text}" target="_blank">${post.text}</a>`
            : post.text;

    const item = document.createElement('div');
    item.className = 'item';
    item.innerHTML = `
        <div class="subject">
            <div class="content">${content}</div>
            <div class="date">${post.timestamp}</div>
        </div>
    `;
    return item;
}

// Function to handle post submission
async function submitPost(e) {
    e.preventDefault();
    const input = document.getElementById('postInput');
    const text = input.value;

    if (!text) return; // Do not submit if input is empty

    try {
        const res = await fetch(`/api/posts?key=${key}`, { // 'key' is now accessible
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });
        if (res.ok) {
            input.value = '';
            input.placeholder = "What's on your mind?";
        } else {
            console.error('Post submission failed:', res.statusText);
            input.placeholder = "Submission failed. Please try again.";
        }
    } catch (error) {
        console.error('Post submission failed:', error);
        input.placeholder = "Submission failed. Please try again.";
    }
}

// Event listeners for form and input field
const postForm = document.getElementById('postForm');
const postInput = document.getElementById('postInput');

if (postForm && postInput) {
    postForm.addEventListener('submit', submitPost);

    postInput.addEventListener('paste', async (e) => {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        let imageFound = false;
        for (const item of items) {
            if (item.type.indexOf('image') === 0) {
                imageFound = true;
                e.preventDefault();
                const blob = item.getAsFile();
                const formData = new FormData();
                formData.append('image', blob);

                try {
                    const res = await fetch(`/api/upload?key=${key}`, { // Ensure 'key' is accessible
                        method: 'POST',
                        body: formData
                    });
                    const data = await res.json();
                    if (res.ok && data.success) {
                        postInput.value = window.location.origin + data.url;
                        postInput.placeholder = "What's on your mind?"; // Reset placeholder on success
                    } else {
                        postInput.value = '';
                        postInput.placeholder = data.message || "Upload failed. Please try again.";
                    }
                } catch (error) {
                    console.error('Image upload failed:', error);
                    postInput.value = '';
                    postInput.placeholder = "Upload failed. Please try again.";
                }
            }
        }
    });

    // Reset placeholder when user starts typing or focuses
    postInput.addEventListener('focus', () => {
        postInput.placeholder = "What's on your mind?";
    });
    postInput.addEventListener('input', () => {
        // Only reset if it's an error message
        if (postInput.placeholder.includes('failed')) {
            postInput.placeholder = "What's on your mind?";
        }
    });

    // Blur postInput when clicking outside of it or its form
    document.addEventListener('click', (e) => {
        if (!postInput.contains(e.target) && !postForm.contains(e.target)) {
            postInput.blur();
        }
    });
}
