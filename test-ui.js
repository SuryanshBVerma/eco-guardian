"use strict";

const http = require("http");
const assert = require("assert");
const { parseArgs } = require("./src/cli/args");
const {
  buildCommand,
  getVisibleFields,
  shellQuote,
} = require("./src/ui/command-builder");
const { startUiServer } = require("./src/ui/server");

function requestJson(url, { method = "GET", body = null } = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: `${parsed.pathname}${parsed.search}`,
        method,
        headers: body
          ? {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(body),
            }
          : undefined,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch (_) {
            json = text;
          }
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: json,
          });
        });
      },
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function assertContainsInOrder(text, parts, message) {
  let cursor = 0;
  for (const part of parts) {
    const index = text.indexOf(part, cursor);
    assert(index >= 0, `${message}: missing ${part}`);
    cursor = index + part.length;
  }
}

async function testCommandBuilder() {
  const command = buildCommand({
    path: "C:\\demo path",
    ecosystems: ["npm", "gradle"],
    graphResolution: true,
    gradleTask: ":app:dependencies",
    dependencyCheckMode: true,
    nvdApiKey: "abc's key",
    severity: "high",
    banner: "off",
    exportHtml: "report.html",
    watch: true,
    notifyOnSeverity: "critical",
    stateFile: "watch.json",
    verbose: true,
  });

  const expected = [
    "node eco-guardian.js",
    `--path ${shellQuote("C:\\demo path")}`,
    `--ecosystems ${shellQuote("npm,gradle")}`,
    "--graph-resolution",
    `--gradle-task ${shellQuote(":app:dependencies")}`,
    "--dependency-check-mode",
    `--nvd-api-key ${shellQuote("abc's key")}`,
    `--severity ${shellQuote("high")}`,
    `--banner ${shellQuote("off")}`,
    `--export-html ${shellQuote("report.html")}`,
    "--watch",
    `--notify-on-severity ${shellQuote("critical")}`,
    `--state-file ${shellQuote("watch.json")}`,
    "--verbose",
  ].join(" ");

  assert(command === expected, `command builder output mismatch:\n${command}`);
  assert(!command.includes("--seek"), "UI command should not emit --seek");
  assert(!command.includes("--echo"), "UI command should not emit --echo");

  // path is emitted without pathExplicit (plain truthy check)
  const withPath = buildCommand({ path: "/home/user/project" });
  assert(
    withPath.includes("--path"),
    "path should be emitted without pathExplicit",
  );
  assert(
    withPath.includes("'/home/user/project'"),
    "path value should be quoted",
  );

  // path suppressed when globalOnly is set
  const withGlobalOnly = buildCommand({
    path: "/home/user/project",
    globalOnly: true,
  });
  assert(
    !withGlobalOnly.includes("--path"),
    "path should be suppressed when globalOnly is true",
  );
  assert(
    withGlobalOnly.includes("--global-only"),
    "globalOnly flag should be present",
  );

  // dependencyCheckMode alone emits --dependency-check-mode (no nvdMode=on required)
  const depCheckAlone = buildCommand({
    dependencyCheckMode: true,
    ecosystems: ["npm"],
  });
  assert(
    depCheckAlone.includes("--dependency-check-mode"),
    "dependencyCheckMode should emit flag without nvdMode=on",
  );
  assert(
    !depCheckAlone.includes("--nvd-mode"),
    "dependencyCheckMode should not also emit --nvd-mode",
  );
  assert(
    !depCheckAlone.includes("--no-nvd"),
    "dependencyCheckMode should not emit --no-nvd",
  );
}

async function testVisibilityRules() {
  const hiddenPath = getVisibleFields({ globalOnly: true }).some(
    (field) => field.key === "path",
  );
  assert(hiddenPath === false, "path should hide when global-only is enabled");

  const gradleState = getVisibleFields({
    ecosystems: ["gradle"],
    graphResolution: true,
  });
  assert(
    gradleState.some((field) => field.key === "gradleTask"),
    "gradleTask should be visible for graph-resolution gradle scans",
  );
  assert(
    gradleState.some((field) => field.key === "nvdApiKey"),
    "nvdApiKey should be visible for Java ecosystems when NVD is enabled",
  );

  const hiddenNvd = getVisibleFields({
    ecosystems: ["gradle"],
    graphResolution: true,
    nvdMode: "off",
  }).some((field) => field.key === "nvdApiKey");
  assert(hiddenNvd === false, "nvdApiKey should hide when NVD mode is off");

  const watchFields = getVisibleFields({ watch: true });
  assert(
    watchFields.some((field) => field.key === "stateFile") &&
      watchFields.some((field) => field.key === "alertsFile"),
    "watch-only fields should appear when watch mode is enabled",
  );
  assert(
    !watchFields.some((field) => field.key === "seek" || field.key === "echo"),
    "easter-egg fields should not appear in the UI manifest",
  );
}

async function testServerEndpoints() {
  const options = parseArgs([
    "--ui",
    "--path",
    "C:\\work\\demo",
    "--ecosystems",
    "gradle",
    "--graph-resolution",
    "--watch",
  ]);
  const ui = await startUiServer(options, {});
  try {
    const bootstrap = await requestJson(`${ui.url}api/bootstrap`);
    assert(
      bootstrap.statusCode === 200,
      "bootstrap endpoint should return 200",
    );
    assert(
      bootstrap.body &&
        bootstrap.body.manifest &&
        bootstrap.body.manifest.title === "eco-guardian command builder",
      "bootstrap should return the UI manifest",
    );
    const allFields = bootstrap.body.manifest.sections.flatMap(
      (section) => section.fields,
    );
    assert(
      !allFields.some((field) => field.key === "seek" || field.key === "echo"),
      "bootstrap manifest should not expose easter-egg fields",
    );
    assert(
      bootstrap.body.command.includes("--watch"),
      "bootstrap command should reflect initial options",
    );

    const html = await requestJson(ui.url);
    assert(html.statusCode === 200, "index page should return 200");
    assert(
      String(html.body).includes("eco-guardian command builder"),
      "index page should include the UI title",
    );

    const command = await requestJson(`${ui.url}api/command`, {
      method: "POST",
      body: JSON.stringify({
        ecosystems: ["npm"],
        path: "C:\\scan",
        pathExplicit: true,
        severity: "critical",
      }),
    });
    assert(command.statusCode === 200, "command endpoint should return 200");
    assert(
      String(command.body.command).includes("--severity"),
      "command endpoint should serialize the submitted state",
    );
    assert(
      !String(command.body.command).includes("--seek") &&
        !String(command.body.command).includes("--echo"),
      "command endpoint should never emit easter-egg flags",
    );

    const invalid = await requestJson(`${ui.url}api/command`, {
      method: "POST",
      body: "{bad json",
    });
    assert(invalid.statusCode === 400, "invalid JSON should return 400");
  } finally {
    await ui.close();
  }
}

async function run() {
  const tests = [
    ["commandBuilder", testCommandBuilder],
    ["visibilityRules", testVisibilityRules],
    ["serverEndpoints", testServerEndpoints],
  ];

  for (const [name, fn] of tests) {
    process.stdout.write(`[TEST] ${name}\n`);
    await fn();
  }
}

run().catch((error) => {
  process.stderr.write(`[FAIL] ${error.stack || error.message}\n`);
  process.exitCode = 1;
});
