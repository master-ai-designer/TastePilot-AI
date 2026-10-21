import test from "node:test";
import assert from "node:assert/strict";

// Import the Express app without starting a second listener from server.js.
process.env.VERCEL = "1";
const { default: app } = await import("../server.js");

let server;
let baseUrl;

test.before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

test("homepage serves the TastePilot interface", async () => {
  const response = await fetch(baseUrl + "/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /text\/html/i);
  assert.match(await response.text(), /TastePilot/i);
});

test("chat rejects an empty message with a client error", async () => {
  const response = await fetch(baseUrl + "/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /message/i);
});

test("discovery rejects an empty query with a client error", async () => {
  const response = await fetch(baseUrl + "/api/discover", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ language: "en", category: "auto", query: "" })
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).status, "error");
});

test("discovery rejects unsupported categories", async () => {
  const response = await fetch(baseUrl + "/api/discover", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ language: "en", category: "not-a-category", query: "romantic music" })
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /category/i);
});

test("public auth config never returns a service-role credential", async () => {
  const response = await fetch(baseUrl + "/api/auth-config");
  const body = await response.json();
  assert.ok([200, 503].includes(response.status));
  assert.equal(Object.hasOwn(body, "serviceRoleKey"), false);
  assert.equal(Object.hasOwn(body, "service_role_key"), false);
});
