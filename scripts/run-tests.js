// Runs the rule tests without a browser: node scripts/run-tests.js
const fs = require("fs"), path = require("path"), vm = require("vm");
const www = path.join(__dirname, "..", "www");
const ctx = { window: { PL_TEST: true }, console };
vm.createContext(ctx);
const code = fs.readFileSync(path.join(www, "core.js"), "utf8") + "\n" + fs.readFileSync(path.join(www, "tests.js"), "utf8").replace('"use strict";', "") + "\n;TEST_RESULTS";
const r = vm.runInContext(code, ctx, { filename: "core+tests.js" });
for (const f of r.failures) console.log("FAIL  [" + f.group + "] " + f.name + "\n      " + f.detail);
console.log(r.failed ? `${r.failed} of ${r.total} tests failed` : `All ${r.total} tests passed`);
process.exit(r.failed ? 1 : 0);
