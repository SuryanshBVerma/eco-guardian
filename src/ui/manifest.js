'use strict'

const { SUPPORTED_ECOSYSTEMS, SCAN_PROFILES } = require('../config/constants')

const UI_MANIFEST = {
  title: 'eco-guardian command builder',
  commandPrefix: 'node eco-guardian.js',
  sections: [
    {
      id: 'target',
      label: 'Target',
      description: 'Where the scan should run.',
      fields: [
        {
          key: 'profile',
          label: 'Scan profile',
          type: 'select',
          options: SCAN_PROFILES.map((value) => ({
            value,
            label: value
          })),
          help: 'Matches --profile <mode>. Controls root discovery behavior.'
        },
        {
          key: 'roots',
          label: 'Explicit roots',
          type: 'text',
          placeholder: '/path/to/scan (comma-separated)',
          help: 'Matches --root <dir>. Repeatable, comma-separated.'
        },
        {
          key: 'listRoots',
          label: 'List discovered roots',
          type: 'boolean',
          help: 'Matches --list-roots. Shows roots and exits.'
        },
        {
          key: 'allUsers',
          label: 'Include all-user directories',
          type: 'boolean',
          help: 'Matches --all-users.'
        },
        {
          key: 'path',
          label: 'Scan directory',
          type: 'text',
          placeholder: 'e.g. ~/projects/my-app',
          help: '--path is only included when a directory is entered.',
          showIf: [{ key: 'globalOnly', truthy: false }]
        },
        {
          key: 'globalOnly',
          label: 'Global npm installs only',
          type: 'boolean',
          help: 'Matches --global-only.'
        },
        {
          key: 'ecosystems',
          label: 'Ecosystems',
          type: 'multiselect',
          options: SUPPORTED_ECOSYSTEMS.map((value) => ({
            value,
            label: value
          })),
          help: 'Matches --ecosystems <list>.'
        },
        {
          key: 'library',
          label: 'Focus library',
          type: 'text',
          placeholder: 'npm:lodash',
          help: 'Matches --library <ecosystem>:<name>. When set, scan is focused to that one library.'
        },
        {
          key: 'global',
          label: 'Include / root on Unix-like systems',
          type: 'boolean',
          help: 'Matches --global.'
        },
        {
          key: 'allDrives',
          label: 'Include all drives',
          type: 'boolean',
          help: 'Matches --all-drives.'
        }
      ]
    },
    {
      id: 'analysis',
      label: 'Analysis',
      description: 'How the scan resolves dependencies.',
      fields: [
        {
          key: 'graphResolution',
          label: 'Resolve dependency graphs',
          type: 'boolean',
          help: 'Matches --graph-resolution.'
        },
        {
          key: 'gradleTask',
          label: 'Gradle task',
          type: 'text',
          placeholder: ':app:dependencies',
          help: 'Matches --gradle-task <task>.',
          showIf: [
            { key: 'graphResolution', truthy: true },
            { ecosystemSelected: 'gradle' }
          ]
        },
        {
          key: 'dependencyCheckMode',
          label: 'Use compatibility alias (--dependency-check-mode)',
          type: 'boolean',
          help: 'Forces --nvd-mode on through the legacy alias.'
        },
        {
          key: 'nvdMode',
          label: 'NVD mode',
          type: 'select',
          options: ['auto', 'on', 'off'].map((value) => ({
            value,
            label: value
          })),
          help: 'Matches --nvd-mode <auto|on|off> and --no-nvd.'
        },
        {
          key: 'nvdApiKey',
          label: 'NVD API key',
          type: 'text',
          placeholder: 'Optional',
          help: 'Matches --nvd-api-key <key>.',
          showIf: [
            { notEquals: { key: 'nvdMode', value: 'off' } },
            { anyEcosystemSelected: ['maven', 'gradle'] }
          ]
        },
        {
          key: 'severity',
          label: 'Minimum severity',
          type: 'select',
          options: ['low', 'moderate', 'high', 'critical'].map((value) => ({
            value,
            label: value
          })),
          help: 'Matches --severity <level>.'
        }
      ]
    },
    {
      id: 'output',
      label: 'Output',
      description: 'How results are emitted.',
      fields: [
        {
          key: 'json',
          label: 'JSON to stdout',
          type: 'boolean',
          help: 'Matches --json.'
        },
        {
          key: 'banner',
          label: 'CLI chrome',
          type: 'select',
          options: ['on', 'off'].map((value) => ({ value, label: value })),
          help: 'Matches --banner <on|off>.'
        },
        {
          key: 'noCache',
          label: 'Disable cache',
          type: 'boolean',
          help: 'Matches --no-cache.'
        },
        {
          key: 'fix',
          label: 'Write fix script',
          type: 'boolean',
          help: 'Matches --fix.'
        },
        {
          key: 'exportTxt',
          label: 'Export TXT report',
          type: 'text',
          placeholder: 'report.txt',
          help: 'Matches --export-txt <file>.'
        },
        {
          key: 'exportHtml',
          label: 'Export HTML report',
          type: 'text',
          placeholder: 'report.html',
          help: 'Matches --export-html <file>.'
        },
        {
          key: 'exportSarif',
          label: 'Export SARIF report',
          type: 'text',
          placeholder: 'report.sarif',
          help: 'Matches --export-sarif <file>.'
        },
        {
          key: 'exportJson',
          label: 'Export JSON report',
          type: 'text',
          placeholder: 'report.json',
          help: 'Matches --export-json <file>.'
        },
        {
          key: 'exportCsv',
          label: 'Export CSV report',
          type: 'text',
          placeholder: 'report.csv',
          help: 'Matches --export-csv <file>.'
        },
        {
          key: 'exportInventoryJsonl',
          label: 'Export inventory NDJSON',
          type: 'text',
          placeholder: 'inventory.ndjson',
          help: 'Matches --export-inventory-jsonl <file>.'
        },
        {
          key: 'exposureCatalog',
          label: 'Exposure catalog',
          type: 'text',
          placeholder: 'catalog.json or directory',
          help: 'Matches --exposure-catalog <file-or-dir>.'
        },
        {
          key: 'offlineExposureOnly',
          label: 'Offline exposure only',
          type: 'boolean',
          help: 'Matches --offline-exposure-only. Skips vulnerability DB queries.'
        }
      ]
    },
    {
      id: 'policy',
      label: 'Policy',
      description: 'Baseline and failure gates.',
      fields: [
        {
          key: 'baseline',
          label: 'Baseline file',
          type: 'text',
          placeholder: '.eco-guardian-baseline.json',
          help: 'Matches --baseline <file>.'
        },
        {
          key: 'writeBaseline',
          label: 'Write baseline file',
          type: 'text',
          placeholder: 'baseline.json',
          help: 'Matches --write-baseline <file>.'
        },
        {
          key: 'strictBaseline',
          label: 'Strict baseline handling',
          type: 'boolean',
          help: 'Matches --strict-baseline.'
        },
        {
          key: 'failOnSeverity',
          label: 'Fail on severity',
          type: 'select',
          options: ['', 'low', 'moderate', 'high', 'critical'].map((value) => ({
            value,
            label: value || 'none'
          })),
          help: 'Matches --fail-on-severity <level>.'
        },
        {
          key: 'maxCritical',
          label: 'Max critical findings',
          type: 'number',
          placeholder: '0',
          help: 'Matches --max-critical <n>.'
        },
        {
          key: 'maxHigh',
          label: 'Max high findings',
          type: 'number',
          placeholder: '0',
          help: 'Matches --max-high <n>.'
        },
        {
          key: 'why',
          label: 'Explain package',
          type: 'text',
          placeholder: 'left-pad',
          help: 'Matches --why <package>.'
        }
      ]
    },
    {
      id: 'watch',
      label: 'Watch',
      description: 'Long-lived incremental monitoring.',
      fields: [
        {
          key: 'watch',
          label: 'Enable watch mode',
          type: 'boolean',
          help: 'Matches --watch.'
        },
        {
          key: 'notifyOnSeverity',
          label: 'Notify on severity',
          type: 'select',
          options: ['low', 'moderate', 'high', 'critical'].map((value) => ({
            value,
            label: value
          })),
          help: 'Matches --notify-on-severity <level>.',
          showIf: [{ key: 'watch', truthy: true }]
        },
        {
          key: 'stateFile',
          label: 'Watch state file',
          type: 'text',
          placeholder: 'eco-guardian-state.json',
          help: 'Matches --state-file <file>.',
          showIf: [{ key: 'watch', truthy: true }]
        },
        {
          key: 'alertsFile',
          label: 'Alerts JSONL file',
          type: 'text',
          placeholder: 'eco-guardian-alerts.jsonl',
          help: 'Matches --alerts-file <file>.',
          showIf: [{ key: 'watch', truthy: true }]
        },
        {
          key: 'alertsMd',
          label: 'Alerts Markdown file',
          type: 'text',
          placeholder: 'eco-guardian-alerts.md',
          help: 'Matches --alerts-md <file>.',
          showIf: [{ key: 'watch', truthy: true }]
        },
        {
          key: 'reconcileInterval',
          label: 'Reconcile interval (sec)',
          type: 'number',
          placeholder: '900',
          help: 'Matches --reconcile-interval <sec>.',
          showIf: [{ key: 'watch', truthy: true }]
        },
        {
          key: 'watchDebounceMs',
          label: 'Debounce (ms)',
          type: 'number',
          placeholder: '1500',
          help: 'Matches --watch-debounce-ms <ms>.',
          showIf: [{ key: 'watch', truthy: true }]
        }
      ]
    },
    {
      id: 'advanced',
      label: 'Advanced',
      description: 'Additional non-default runtime switches.',
      fields: [
        {
          key: 'benchmark',
          label: 'Benchmark mode',
          type: 'boolean',
          help: 'Matches --benchmark.'
        },
        {
          key: 'verbose',
          label: 'Verbose output',
          type: 'boolean',
          help: 'Matches --verbose.'
        },
        {
          key: 'selftest',
          label: 'Run selftest',
          type: 'boolean',
          help: 'Matches --selftest. Runs self-contained validation.'
        }
      ]
    }
  ]
}

module.exports = {
  UI_MANIFEST
}
