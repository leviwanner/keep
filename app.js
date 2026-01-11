const fs = require("fs");
const path = require("path");

module.exports = function (posts, key, isEdit, hasOlder, hasNewer, page) {
  const postItems = posts
    .map((post) => {
      const isImage = post.text.match(/\.(jpeg|jpg|gif|png|webp)/i) != null;
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
    })
    .join("");

  const template = fs.readFileSync(
    path.join(__dirname, "public", "templates", "index.html"),
    "utf8"
  );
  const form = isEdit
    ? `
        <form id="postForm">
            <input type="text" name="input" id="postInput" placeholder="What's on your mind?" required />
            <button type="submit">Share</button>
        </form>
    `
    : "";

  let archive = "";
  if (hasOlder || hasNewer) {
    archive = '<div class="archive">';
    if (hasOlder) {
      archive += `<a href="/?key=${key}&page=${page + 1}" id="older">Older</a>`;
    }
    archive += '<div class="spacer"></div>';
    if (hasNewer) {
      archive += `<a href="/?key=${key}&page=${page - 1}" id="newer">Newer</a>`;
    }
    archive += "</div>";
  }

  return template
    .replace("{{posts}}", postItems)
    .replace("{{form}}", form)
    .replace("{{archive}}", archive);
};
