'use strict';

const os = require('os');
const { VERSION, SEVERITY_ORDER, SUPPORTED_ECOSYSTEMS } = require('../config/constants');

function parseEcosystemList(value) {
  const list = value.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (list.length === 0) throw new Error('Empty ecosystem list');
  for (const item of list) {
    if (!SUPPORTED_ECOSYSTEMS.includes(item)) throw new Error(`Unsupported ecosystem: ${item}`);
  }
  return list;
}

function printUsage() {
  process.stdout.write(`eco-guardian v${VERSION}\n`);
  process.stdout.write('Usage:\n  node eco-guardian.js [flags]\n\n');
  process.stdout.write('Flags:\n');
  process.stdout.write('  --path <dir>         Scan specific directory (default: home directory)\n');
  process.stdout.write('  --global-only        Only scan global npm installs\n');
  process.stdout.write('  --ecosystems <list>  Comma-separated ecosystems: npm,maven,nuget,vscode,python,go (default: npm)\n');
  process.stdout.write('  --graph-resolution   Resolve dependency graphs using ecosystem-specific native tools\n');
  process.stdout.write('  --severity <level>   Minimum: low|moderate|high|critical (default: low)\n');
  process.stdout.write('  --json               Output only JSON findings to stdout\n');
  process.stdout.write('  --no-cache           Disable cache read/write\n');
  process.stdout.write('  --fix                Write fix script to current directory\n');
  process.stdout.write('  --export-txt <file>  Export findings to TXT report\n');
  process.stdout.write('  --export-html <file> Export findings to HTML report\n');
  process.stdout.write('  --benchmark          Show real-time RAM/CPU usage during scan\n');
  process.stdout.write('  --help               Show this help\n');
  process.stdout.write('  --version            Show version\n');
  process.stdout.write('  --global             Include / root scan on Unix\n');
  process.stdout.write('  --all-drives         Alias for full-disk opt-in behavior\n');
}

function parseArgs(argv) {
  const args = {
    path: os.homedir(),
    pathExplicit: false,
    globalOnly: false,
    ecosystems: ['npm'],
    graphResolution: false,
    severity: 'low',
    json: false,
    noCache: false,
    fix: false,
    exportTxt: null,
    exportHtml: null,
    help: false,
    version: false,
    global: false,
    allDrives: false,
    verbose: false,
    benchmark: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--path') {
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) throw new Error('Missing value for --path');
      args.path = next;
      args.pathExplicit = true;
      i += 1;
      continue;
    }
    if (token === '--severity') {
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) throw new Error('Missing value for --severity');
      const normalized = String(next).toLowerCase();
      if (!Object.prototype.hasOwnProperty.call(SEVERITY_ORDER, normalized)) throw new Error('Invalid severity. Use: low, moderate, high, critical');
      args.severity = normalized; i += 1; continue;
    }
    if (token === '--global-only') { args.globalOnly = true; continue; }
    if (token === '--ecosystems') {
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) throw new Error('Missing value for --ecosystems');
      args.ecosystems = parseEcosystemList(next);
      i += 1;
      continue;
    }
    if (token === '--json') { args.json = true; continue; }
    if (token === '--no-cache') { args.noCache = true; continue; }
    if (token === '--fix') { args.fix = true; continue; }
    if (token === '--export-txt') {
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) throw new Error(`Missing value for ${token}`);
      args.exportTxt = next;
      i += 1;
      continue;
    }
    if (token === '--export-html') {
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) throw new Error('Missing value for --export-html');
      args.exportHtml = next;
      i += 1;
      continue;
    }
    if (token === '--help') { args.help = true; continue; }
    if (token === '--version') { args.version = true; continue; }
    if (token === '--global') { args.global = true; continue; }
    if (token === '--all-drives') { args.allDrives = true; continue; }
    if (token === '--verbose') { args.verbose = true; continue; }
    if (token === '--benchmark') { args.benchmark = true; continue; }
    if (token === '--graph-resolution') { args.graphResolution = true; continue; }
    throw new Error(`Unknown argument: ${token}`);
  }

  return args;
}

module.exports = {
  printUsage,
  parseArgs,
  parseEcosystemList
};
