"use strict";

const VERSION = "2.0.0";
const DEFAULT_BASELINE_FILE = ".eco-guardian-baseline.json";
const PLATFORM = process.platform;
const SEVERITY_ORDER = { low: 1, moderate: 2, high: 3, critical: 4 };

const SUPPORTED_ECOSYSTEMS = [
  "npm",
  "maven",
  "gradle",
  "nuget",
  "vscode",
  "python",
  "go",
  "ruby",
  "rust",
  "php",
  "dart",
  "elixir",
  "conan",
  "haskell",
  "swift",
  "r",
];
const OSV_ECOSYSTEM_MAP = {
  npm: "npm",
  maven: "Maven",
  gradle: "Maven",
  nuget: "NuGet",
  vscode: "VSCode",
  python: "PyPI",
  go: "Go",
  ruby: "RubyGems",
  rust: "crates.io",
  php: "Packagist",
  dart: "Pub",
  elixir: "Hex",
  conan: "ConanCenter",
  haskell: "Hackage",
  swift: "SwiftURL",
  r: "CRAN",
};

const GRAPH_RESOLUTION_SUPPORT = {
  npm: "supported",
  maven: "supported",
  gradle: "supported",
  nuget: "supported",
  go: "supported",
  python: "partial",
  vscode: "not_applicable",
  ruby: "supported",
  rust: "supported",
  php: "supported",
  dart: "supported",
  elixir: "partial",
  conan: "partial",
  haskell: "partial",
  swift: "partial",
  r: "partial",
};

const MAVEN_MANIFEST_NAMES = new Set(["pom.xml"]);
const NUGET_MANIFEST_NAMES = new Set([
  "packages.config",
  "Directory.Packages.props",
  ".csproj",
  ".vbproj",
  ".fsproj",
  "packages.lock.json",
]);
const PYTHON_MANIFEST_NAMES = new Set([
  "requirements.txt",
  "Pipfile.lock",
  "poetry.lock",
]);
const GO_MANIFEST_NAMES = new Set(["go.mod"]);
const RUBY_MANIFEST_NAMES = new Set(["Gemfile", "Gemfile.lock"]);
const RUST_MANIFEST_NAMES = new Set(["Cargo.toml", "Cargo.lock"]);
const PHP_MANIFEST_NAMES = new Set(["composer.json", "composer.lock"]);
const DART_MANIFEST_NAMES = new Set(["pubspec.yaml", "pubspec.lock"]);
const ELIXIR_MANIFEST_NAMES = new Set(["mix.exs", "mix.lock"]);
const CONAN_MANIFEST_NAMES = new Set([
  "conanfile.txt",
  "conanfile.py",
  "conan.lock",
]);
const HASKELL_MANIFEST_NAMES = new Set([
  "stack.yaml",
  "stack.yaml.lock",
  "cabal.project.freeze",
]);
const SWIFT_MANIFEST_NAMES = new Set(["Package.swift", "Package.resolved"]);
const R_MANIFEST_NAMES = new Set(["DESCRIPTION", "renv.lock"]);
const GRADLE_BUILD_FILES = new Set(["build.gradle", "build.gradle.kts"]);
const GRADLE_AUX_FILES = new Set([
  "settings.gradle",
  "settings.gradle.kts",
  "gradle.lockfile",
  "buildscript-gradle.lockfile",
  "libs.versions.toml",
]);
const MAVEN_CENTRAL_URL = "https://repo1.maven.org/maven2";

const COLORS = {
  reset: "\x1b[0m",
  gray: "\x1b[90m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

const LEVEL_META = {
  success: { icon: "[OK]", color: COLORS.green },
  warn: { icon: "[WARN]", color: COLORS.yellow },
  error: { icon: "[ERR]", color: COLORS.red },
  info: { icon: "[INFO]", color: COLORS.gray },
  vigil: { icon: "[VIGIL]", color: COLORS.cyan },
};

const DISCOVERY_CONCURRENCY = 50;
const PACKAGE_READ_CONCURRENCY = 100;
const API_CONCURRENCY = 2; // Lowered to prevent resource exhaustion during heavy graph commands
const RESOLUTION_CONCURRENCY = 4; // Max parallel native tool calls
const OSV_BATCH_SIZE = 1000;
const CACHE_TTL_MS = 60 * 60 * 1000;
const HTTP_RETRY_MAX = 2;
const HTTP_RETRY_BASE_MS = 250;
const HTTP_RETRY_MAX_MS = 2000;
const POLICY_FAIL_EXIT_CODE = 3;

const WALK_SKIP_NAMES = new Set([
  ".git",
  ".svn",
  ".hg",
  "__pycache__",
  ".venv",
  "venv",
  "env",
  ".cache",
  ".npm",
  ".yarn",
  ".pnpm-store",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  ".output",
  "vendor",
  "target",
  ".cargo",
  "Library",
  "System",
  "Windows",
  "$Recycle.Bin",
  "proc",
  "sys",
  "dev",
  "run",
  "boot",
  "snap",
]);

const DEFAULT_WATCH_STATE_FILE = "eco-guardian-state.json";
const DEFAULT_ALERTS_FILE = "eco-guardian-alerts.jsonl";
const DEFAULT_ALERTS_MD_FILE = "eco-guardian-alerts.md";
const DEFAULT_NOTIFY_SEVERITY = "high";
const DEFAULT_RECONCILE_INTERVAL_SEC = 900;
const DEFAULT_WATCH_DEBOUNCE_MS = 1500;

module.exports = {
  VERSION,
  PLATFORM,
  SEVERITY_ORDER,
  COLORS,
  LEVEL_META,
  DISCOVERY_CONCURRENCY,
  PACKAGE_READ_CONCURRENCY,
  API_CONCURRENCY,
  RESOLUTION_CONCURRENCY,
  DEFAULT_BASELINE_FILE,
  OSV_BATCH_SIZE,
  CACHE_TTL_MS,
  HTTP_RETRY_MAX,
  HTTP_RETRY_BASE_MS,
  HTTP_RETRY_MAX_MS,
  POLICY_FAIL_EXIT_CODE,
  WALK_SKIP_NAMES,
  SUPPORTED_ECOSYSTEMS,
  OSV_ECOSYSTEM_MAP,
  MAVEN_MANIFEST_NAMES,
  NUGET_MANIFEST_NAMES,
  PYTHON_MANIFEST_NAMES,
  GO_MANIFEST_NAMES,
  RUBY_MANIFEST_NAMES,
  RUST_MANIFEST_NAMES,
  PHP_MANIFEST_NAMES,
  DART_MANIFEST_NAMES,
  ELIXIR_MANIFEST_NAMES,
  CONAN_MANIFEST_NAMES,
  HASKELL_MANIFEST_NAMES,
  SWIFT_MANIFEST_NAMES,
  R_MANIFEST_NAMES,
  GRADLE_BUILD_FILES,
  GRADLE_AUX_FILES,
  GRAPH_RESOLUTION_SUPPORT,
  MAVEN_CENTRAL_URL,
  DEFAULT_WATCH_STATE_FILE,

  DEFAULT_ALERTS_FILE,
  DEFAULT_ALERTS_MD_FILE,
  DEFAULT_NOTIFY_SEVERITY,
  DEFAULT_RECONCILE_INTERVAL_SEC,
  DEFAULT_WATCH_DEBOUNCE_MS,
  THOUGHT_WORDS: [
    "Accomplishing",
    "Elucidating",
    "Perusing",
    "Actioning",
    "Enchanting",
    "Philosophising",
    "Actualizing",
    "Envisioning",
    "Pondering",
    "Baking",
    "Finagling",
    "Pontificating",
    "Booping",
    "Flibbertigibbeting",
    "Processing",
    "Brewing",
    "Forging",
    "Puttering",
    "Calculating",
    "Forming",
    "Puzzling",
    "Channelling",
    "Generating",
    "Reticulating",
    "Churning",
    "Germinating",
    "Ruminating",
    "Hatching",
    "Scheming",
    "Coalescing",
    "Herding",
    "Schlepping",
    "Cogitating",
    "Honking",
    "Shimmying",
    "Combobulating",
    "Hustling",
    "Shucking",
    "Computing",
    "Ideating",
    "Simmering",
    "Concocting",
    "Imagining",
    "Smooshing",
    "Conjuring",
    "Incubating",
    "Spelunking",
    "Considering",
    "Inferring",
    "Spinning",
    "Contemplating",
    "Jiving",
    "Stewing",
    "Cooking",
    "Manifesting",
    "Sussing",
    "Crafting",
    "Marinating",
    "Synthesizing",
    "Creating",
    "Meandering",
    "Thinking",
    "Crunching",
    "Moseying",
    "Tinkering",
    "Deciphering",
    "Mulling",
    "Transmuting",
    "Deliberating",
    "Mustering",
    "Unfurling",
    "Determining",
    "Musing",
    "Unravelling",
    "Divining",
    "Noodling",
    "Vibing",
    "Doing",
    "Percolating",
    "Wandering",
    "Effecting",
    "Frolicking",
    "Whirring",
    "Wibbling",
    "Wizarding",
    "Working",
    "Wrangling",
  ],
  THOUGHT_BOUNCE_FRAMES: ["(●  )", "( ● )", "(  ●)", "( ● )"],
};
