// `npm run dev` with SCOPE_FAKE_AI=1: instant, free, predictable AI answers for UI work and e2e tests.
import { spawn } from "node:child_process";

const child = spawn("npx", ["next", "dev", "-H", "0.0.0.0", ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, SCOPE_FAKE_AI: "1" },
});
child.on("exit", (code) => process.exit(code ?? 0));
