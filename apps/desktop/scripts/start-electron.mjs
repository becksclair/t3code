import { spawn } from "node:child_process";

import {
  desktopDir,
  resolveElectronLaunchArgs,
  resolveSystemElectronCommand,
} from "./electron-launcher.mjs";

const electronCommand = resolveSystemElectronCommand();
const childEnv = { ...process.env };
delete childEnv.ELECTRON_RUN_AS_NODE;

const child = spawn(
  electronCommand,
  resolveElectronLaunchArgs("dist-electron/main.js", [], childEnv),
  {
    stdio: "inherit",
    cwd: desktopDir,
    env: childEnv,
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
