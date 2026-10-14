const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

function createStorage() {
  if (process.env.STORAGE_BACKEND === "firestore") {
    const { Firestore } = require("@google-cloud/firestore");
    const db = new Firestore();
    const drivers = db.collection("drivers");
    return {
      async list(date) {
        const snapshot = await drivers.where("date", ">=", date).get();
        return snapshot.docs.map(doc => doc.data());
      },
      async add(record) {
        // A stable key makes simultaneous submissions for the same phone/date atomic.
        record.id = crypto.createHash("sha256").update(`${record.date}:${record.phone}`).digest("hex");
        try {
          await drivers.doc(record.id).create(record);
          return true;
        } catch (error) {
          if (error.code === 6) return false; // ALREADY_EXISTS
          throw error;
        }
      },
      async remove(id, token) {
        return db.runTransaction(async transaction => {
          const ref = drivers.doc(id);
          const doc = await transaction.get(ref);
          if (!doc.exists || doc.data().token !== token) return false;
          transaction.delete(ref);
          return true;
        });
      }
    };
  }
  if (process.env.STORAGE_BACKEND && process.env.STORAGE_BACKEND !== "file") {
    throw new Error("STORAGE_BACKEND must be file or firestore");
  }
  if (process.env.K_SERVICE) throw new Error("Cloud Run requires STORAGE_BACKEND=firestore");
  const file = path.join(process.env.DATA_DIR || __dirname, "data.json");
  const load = () => {
    try { return JSON.parse(fs.readFileSync(file, "utf8")); }
    catch (error) { if (error.code === "ENOENT") return []; throw error; }
  };
  const save = records => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file + ".tmp", JSON.stringify(records, null, 2));
    fs.renameSync(file + ".tmp", file);
  };
  return {
    async list(date) { return load().filter(record => record.date >= date); },
    async add(record) {
      const records = load();
      if (records.some(existing => existing.phone === record.phone && existing.date === record.date)) return false;
      records.push(record);
      save(records);
      return true;
    },
    async remove(id, token) {
      const records = load();
      const index = records.findIndex(record => record.id === id && record.token === token);
      if (index < 0) return false;
      records.splice(index, 1);
      save(records);
      return true;
    }
  };
}

module.exports = { createStorage };
