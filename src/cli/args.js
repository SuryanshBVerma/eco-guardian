'use strict';

const os = require('os');
const { VERSION, SEVERITY_ORDER } = require('../config/constants');

function printUsage() {
  process.stdout.write(`npm-guardian v${VERSION}\n`);
  process.stdout.write('Usage:\n  node npm-guardian.js [flags]\n\n');
  process.stdout.write('Flags:\n');
  process.stdout.write('  --path <dir>         Scan specific directory (default: home directory)\n');
  process.stdout.write('  --global-only        Only scan global npm installs\n');
  process.stdout.write('  --severity <level>   Minimum: low|moderate|high|critical (default: low)\n');
  process.stdout.write('  --json               Output only JSON findings to stdout\n');
  process.stdout.write('  --no-cache           Disable cache read/write\n');
  process.stdout.write('  --fix                Write fix script to current directory\n');
  process.stdout.write('  --export-txt <file>  Export findings to TXT report\n');
  process.stdout.write('  --export <file>      Alias of --export-txt\n');
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
    severity: 'low',
    json: false,
    noCache: false,
    fix: false,
    exportTxt: null,
    help: false,
    version: false,
    global: false,
    allDrives: false,
    verbose: false
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
    if (token === '--json') { args.json = true; continue; }
    if (token === '--no-cache') { args.noCache = true; continue; }
    if (token === '--fix') { args.fix = true; continue; }
    if (token === '--export-txt' || token === '--export') {
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) throw new Error(`Missing value for ${token}`);
      args.exportTxt = next;
      i += 1;
      continue;
    }
    if (token === '--export-html') {
      throw new Error('Unsupported flag: --export-html. Use --export-txt or --export.');
    }
    if (token === '--help') { args.help = true; continue; }
    if (token === '--version') { args.version = true; continue; }
    if (token === '--global') { args.global = true; continue; }
    if (token === '--all-drives') { args.allDrives = true; continue; }
    if (token === '--verbose') { args.verbose = true; continue; }
    throw new Error(`Unknown argument: ${token}`);
  }

  return args;
}

module.exports = {
  printUsage,
  parseArgs
};
