"use strict";

const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

async function runCommand(file, args, options = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(file, args, {
      timeout: options.timeoutMs || 15000,
      maxBuffer: 10 * 1024 * 1024,
      cwd: options.cwd || process.cwd(),
      windowsHide: true,
    });
    return { ok: true, stdout: stdout || "", stderr: stderr || "" };
  } catch (error) {
    return {
      ok: false,
      stdout: error.stdout || "",
      stderr: error.stderr || "",
      error,
    };
  }
}

module.exports = {
  runCommand,
};
