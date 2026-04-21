"use strict";

const { VERSION } = require("../config/constants");
const { parseArgs, printUsage } = require("../cli/args");
const { printBanner, log } = require("../cli/output");
const { runScan } = require("./run-scan");

function attachSignalHandlers(context) {
  const handler = (signal) => {
    context.interrupted = true;
    process.stderr.write(
      `\n[WARN] Received ${signal}. Exiting gracefully with partial state.\n`,
    );
    process.exit(2);
  };
  process.on("SIGINT", handler);
  process.on("SIGTERM", handler);
}

async function withMutedStderr(enabled, fn) {
  if (!enabled) return fn();

  const originalWrite = process.stderr.write;
  process.stderr.write = (chunk, encoding, callback) => {
    if (typeof encoding === "function") encoding();
    if (typeof callback === "function") callback();
    return true;
  };

  try {
    return await fn();
  } finally {
    process.stderr.write = originalWrite;
  }
}

async function main(argv = process.argv.slice(2)) {
  const state = { interrupted: false };
  attachSignalHandlers(state);

  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`[ERR] ${error.message}\n`);
    process.exitCode = 2;
    return;
  }

  if (options.help) {
    printUsage();
    process.exitCode = 0;
    return;
  }
  if (options.version) {
    process.stdout.write(`${VERSION}\n`);
    process.exitCode = 0;
    return;
  }

  if (options.seek) {
    if (options.seek === "01001000") {
      process.stdout.write("\nIn the shadow of the dependency tree,\n");
      process.stdout.write("A silent watcher waits for thee.\n");
      process.stdout.write("The roots are deep, the paths are wide,\n");
      process.stdout.write(
        "But where does the ancient vulnerability hide?\n\n",
      );
      process.exit(0);
    }
  }

  if (options.echo) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    process.stdout.write(`...${options.echo}?\n`);
    process.exit(0);
  }

  if (options.banner !== "off") {
    printBanner(options);
  }

  try {
    const result = await withMutedStderr(options.banner === "off", () =>
      options.watch
        ? require("../watch").startWatchService(options, state)
        : runScan(options, state),
    );
    process.exitCode =
      typeof result.exitCode === "number"
        ? result.exitCode
        : result.findings && result.findings.length > 0
          ? 1
          : 0;
  } catch (error) {
    log("error", error.message || String(error), options || { json: false });
    process.exitCode = 2;
  }
}

module.exports = {
  main,
};
