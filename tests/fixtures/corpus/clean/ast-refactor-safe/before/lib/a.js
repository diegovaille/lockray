const http = require("http");
function makeRequest(opts) {
  return http.request(opts);
}
module.exports = { makeRequest };
