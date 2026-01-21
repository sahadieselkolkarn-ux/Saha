import { spawn } from "node:child_process";

const port = process.env.PORT || "9002";
const host = "0.0.0.0";

// ปิดความเสี่ยง turbopack เพี้ยน: ถ้ายังมีปัญหา ให้เอา --turbopack ออกได้
const args = ["next", "dev", "--turbopack", "--hostname", host, "--port", port];

console.log("[dev-idx] PORT =", port, "HOST =", host);
const child = spawn("npx", args, { stdio: "inherit" });

child.on("exit", (code) => process.exit(code ?? 1));
