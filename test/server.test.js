const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

test("listings persist across restarts; duplicates and unauthorized deletion are rejected", { timeout: 15000 }, async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "carpool-test-"));
  let server;
  t.after(async () => {
    if (server && server.exitCode === null) { const stopped = once(server, "exit"); server.kill(); await stopped; }
    await fs.rm(dir, { recursive: true, force: true });
  });
  async function start() {
    server = spawn(process.execPath, [path.join(__dirname, "../server.js")], {
      env: { ...process.env, K_SERVICE: "", PORT: "0", DATA_DIR: dir, STORAGE_BACKEND: "file" },
      stdio: ["ignore", "pipe", "pipe"]
    });
    const output = await new Promise((resolve, reject) => {
      let errors = "";
      server.stderr.on("data", data => { errors += data; });
      server.once("error", reject);
      server.once("exit", code => reject(new Error(`Server exited (${code}): ${errors}`)));
      server.stdout.once("data", resolve);
    });
    return `http://127.0.0.1:${String(output).trim().split(":").pop()}`;
  }
  let base = await start();
  const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const payload = { name: "Test D", city: "Riverside", date, phone: "2025550100" };
  const post = () => fetch(base + "/api/drivers", { method: "POST", body: JSON.stringify(payload) });
  assert.equal((await fetch(base)).status, 200);
  const submissions = await Promise.all([post(), post()]);
  assert.deepEqual(submissions.map(r => r.status).sort(), [201, 409]);
  const created = await submissions.find(r => r.status === 201).json();
  const stopped = once(server, "exit"); server.kill(); await stopped; server = null;
  base = await start();
  const list = await (await fetch(base + "/api/drivers")).json();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, created.id);
  assert.equal(list[0].token, undefined);
  assert.equal((await fetch(`${base}/api/drivers/${created.id}?token=wrong`, { method: "DELETE" })).status, 404);
  assert.equal((await fetch(`${base}/api/drivers/${created.id}?token=${created.token}`, { method: "DELETE" })).status, 200);
  assert.deepEqual(await (await fetch(base + "/api/drivers")).json(), []);
  assert.equal((await fetch(base + "/api/drivers", { method: "POST", body: "{" })).status, 400);
  await fs.writeFile(path.join(dir, "data.json"), "broken");
  assert.equal((await fetch(base + "/api/drivers")).status, 503);
});
