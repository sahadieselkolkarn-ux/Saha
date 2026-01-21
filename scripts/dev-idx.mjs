import { spawn } from "node:child_process";
import fs from "node:fs";

const argv = process.argv.slice(2);

function readArg(name, fallback) {
  const i = argv.indexOf(name);
  if (i >= 0 && argv[i + 1]) return argv[i + 1];
  return fallback;
}

const port = readArg("--port", "3000");
const host = readArg("--hostname", "0.0.0.0");

// ใช้ next binary ในโปรเจค ถ้าไม่มีค่อย fallback ไป npx
const localNext = "node_modules/.bin/next";
const useLocal = fs.existsSync(localNext);

const cmd = useLocal ? localNext : "npx";
const args = useLocal
  ? ["dev", "--hostname", host, "--port", port]
  : ["next", "dev", "--hostname", host, "--port", port];

console.log(`[dev-idx] host=${host} port=${port} (useLocalNext=${useLocal})`);

const child = spawn(cmd, args, { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 1));
