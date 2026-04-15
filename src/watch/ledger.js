'use strict';

const fs = require('fs');
const readline = require('readline');

async function appendAlert(alert, filePath) {
  if (!filePath) return;
  const line = JSON.stringify({ ...alert, timestamp: new Date().toISOString() }) + '\n';
  fs.appendFileSync(filePath, line);
}

async function loadAlertLedger(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  const ledger = [];
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (line.trim()) {
      try {
        ledger.push(JSON.parse(line));
      } catch (e) {
        // Skip malformed lines
      }
    }
  }
  return ledger;
}

function alreadyAlerted(ledger, findingFingerprint) {
  return ledger.some(entry => entry.fingerprint === findingFingerprint && entry.type === 'alert');
}

function markResolved(ledger, findingFingerprint, filePath) {
  if (ledger.some(entry => entry.fingerprint === findingFingerprint && entry.type === 'resolved')) return;
  appendAlert({ fingerprint: findingFingerprint, type: 'resolved' }, filePath);
}

module.exports = {
  appendAlert,
  loadAlertLedger,
  alreadyAlerted,
  markResolved,
};
