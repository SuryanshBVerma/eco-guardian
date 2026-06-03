'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

function readJson (relativePath) {
  const fullPath = path.join(__dirname, relativePath)
  return JSON.parse(fs.readFileSync(fullPath, 'utf8'))
}

function readText (relativePath) {
  return fs.readFileSync(path.join(__dirname, relativePath), 'utf8')
}

test('marketplace manifest has correct structure', () => {
  const marketplace = readJson('.claude-plugin/marketplace.json')
  assert.strictEqual(marketplace.name, 'eco-guardian-marketplace')
  assert.strictEqual(marketplace.owner.name, 'boredom1234')
  assert.strictEqual(marketplace.owner.url, 'https://github.com/boredom1234')
  assert.strictEqual(marketplace.metadata.version, '1.0.0')
  assert(Array.isArray(marketplace.plugins))
})

test('marketplace manifest points to bundled plugin', () => {
  const marketplace = readJson('.claude-plugin/marketplace.json')
  const plugin = marketplace.plugins.find((item) => item.name === 'eco-guardian')
  assert(plugin, 'eco-guardian plugin entry should exist')
  assert.strictEqual(plugin.source, './claude-plugin')
  assert.strictEqual(plugin.version, '1.0.0')
  assert.strictEqual(plugin.category, 'security')
  assert(Array.isArray(plugin.tags))
  assert(plugin.tags.includes('security'))
})

test('plugin manifest is valid', () => {
  const plugin = readJson('claude-plugin/.claude-plugin/plugin.json')
  assert.strictEqual(plugin.name, 'eco-guardian')
  assert.strictEqual(plugin.version, '1.0.0')
  assert.strictEqual(typeof plugin.description, 'string')
  assert(plugin.description.length > 0)
  assert.strictEqual(plugin.author.name, 'boredom1234')
  assert.strictEqual(plugin.license, 'MIT')
  assert.strictEqual(plugin.repository, 'https://github.com/boredom1234/eco-guardian')
  assert(Array.isArray(plugin.keywords))
})

test('command files exist for all expected commands', () => {
  const expected = [
    'scan',
    'ci-gate',
    'fix-plan',
    'why',
    'doctor',
    'quick-scan',
    'report',
    'baseline-create',
    'baseline-review'
  ]
  for (const name of expected) {
    const filePath = `claude-plugin/commands/${name}.md`
    assert(fs.existsSync(path.join(__dirname, filePath)), `${filePath} should exist`)
  }
})

test('command files have frontmatter with description', () => {
  const commands = ['scan', 'ci-gate', 'fix-plan', 'why']
  for (const name of commands) {
    const text = readText(`claude-plugin/commands/${name}.md`)
    assert(text.startsWith('---\n'), `${name}.md should start with frontmatter`)
    assert(text.includes('description:'), `${name}.md should have a description field`)
    assert(text.includes('allowed-tools:'), `${name}.md should declare allowed-tools`)
  }
})

test('command files reference eco-guardian via npx', () => {
  const commands = ['scan', 'ci-gate', 'fix-plan', 'why']
  for (const name of commands) {
    const text = readText(`claude-plugin/commands/${name}.md`)
    assert(
      text.includes('npx -y github:boredom1234/eco-guardian'),
      `${name}.md should call eco-guardian via npx`
    )
  }
})

test('command files handle exit codes and always exit 0', () => {
  const commands = ['scan', 'ci-gate', 'fix-plan', 'why']
  for (const name of commands) {
    const text = readText(`claude-plugin/commands/${name}.md`)
    assert(
      text.includes('eco-guardian exit code: $status'),
      `${name}.md should echo the exit code`
    )
    assert(text.includes('exit 0'), `${name}.md should end bash blocks with exit 0`)
    assert(
      text.includes('status=$?'),
      `${name}.md should capture exit code with status=$?`
    )
  }
})

test('fix-plan command does not include --fix in executable blocks', () => {
  const text = readText('claude-plugin/commands/fix-plan.md')
  const bashBlocks = text.match(/```bash[\s\S]*?```/g) || []
  for (const block of bashBlocks) {
    assert(
      !block.includes('--fix'),
      'fix-plan executable bash blocks must not contain --fix'
    )
  }
})

test('fix-plan command documents explicit consent requirement', () => {
  const text = readText('claude-plugin/commands/fix-plan.md')
  assert(
    text.includes('Only run `--fix` when the user explicitly asks'),
    'fix-plan should document need for explicit user consent for --fix'
  )
})

test('scan.md does not include --fix flag', () => {
  const text = readText('claude-plugin/commands/scan.md')
  const bashBlocks = text.match(/```bash[\s\S]*?```/g) || []
  for (const block of bashBlocks) {
    assert(
      !block.includes('--fix'),
      'scan executable bash blocks must not contain --fix'
    )
  }
})

test('scan.md exit code guidance is present', () => {
  const text = readText('claude-plugin/commands/scan.md')
  assert(text.includes('exit code 0 as no visible findings'))
  assert(text.includes('exit code 1 as findings found'))
  assert(text.includes('exit code 2 as a runtime error'))
  assert(text.includes('exit code 3 as a policy gate failure'))
})

test('ci-gate.md default includes SARIF export and policy flags', () => {
  const text = readText('claude-plugin/commands/ci-gate.md')
  assert(text.includes('--export-sarif'))
  assert(text.includes('--fail-on-severity'))
  assert(text.includes('--max-critical'))
})

test('plugin.json and marketplace.json versions match', () => {
  const marketplace = readJson('.claude-plugin/marketplace.json')
  const entry = marketplace.plugins.find((item) => item.name === 'eco-guardian')
  const meta = readJson('claude-plugin/.claude-plugin/plugin.json')
  assert.strictEqual(entry.version, meta.version)
})

test('plugin.json has valid semver version', () => {
  const plugin = readJson('claude-plugin/.claude-plugin/plugin.json')
  assert(/^\d+\.\d+\.\d+$/.test(plugin.version), 'version should be semver')
})

test('marketplace.json plugin entry has valid semver', () => {
  const marketplace = readJson('.claude-plugin/marketplace.json')
  const entry = marketplace.plugins.find((item) => item.name === 'eco-guardian')
  assert(/^\d+\.\d+\.\d+$/.test(entry.version), 'plugin entry version should be semver')
})

test('command files contain summary guidance', () => {
  const text = readText('claude-plugin/commands/scan.md')
  assert(text.includes('summarize') || text.includes('Summarize'))
})

test('why.md handles missing package name gracefully', () => {
  const text = readText('claude-plugin/commands/why.md')
  assert(
    text.includes('ask for one'),
    'why.md should instruct to ask when package name is missing'
  )
  assert(text.includes('--why $ARGUMENTS'))
})

test('all command files end with a newline', () => {
  const commands = ['scan', 'ci-gate', 'fix-plan', 'why']
  for (const name of commands) {
    const text = readText(`claude-plugin/commands/${name}.md`)
    assert(text.endsWith('\n'), `${name}.md should end with a trailing newline`)
  }
})

test('command files have argument-hint in frontmatter', () => {
  const commands = ['scan', 'ci-gate', 'fix-plan', 'why']
  for (const name of commands) {
    const text = readText(`claude-plugin/commands/${name}.md`)
    assert(
      text.includes('argument-hint:'),
      `${name}.md should have an argument-hint field`
    )
  }
})

test('command files include shell injection guard before bash blocks', () => {
  const commands = ['scan', 'ci-gate', 'fix-plan', 'why']
  for (const name of commands) {
    const text = readText(`claude-plugin/commands/${name}.md`)
    assert(
      text.includes('shell control operators'),
      `${name}.md should warn about shell control operators`
    )
    assert(
      text.includes('plain eco-guardian flags only'),
      `${name}.md should ask for plain flags when injection is suspected`
    )
  }
})

// --- expanded tests for v2 plugin enhancement ---

test('doctor.md has two bash blocks and checks environment', () => {
  const text = readText('claude-plugin/commands/doctor.md')
  assert(text.includes('node --version'), 'doctor should check node version')
  assert(text.includes('NVD_API_KEY'), 'doctor should check NVD_API_KEY presence')
  assert(
    text.includes('eco-guardian version check exit'),
    'doctor should check eco-guardian availability'
  )
  assert(!text.includes('$NVD_API_KEY'), 'doctor must not echo NVD_API_KEY value')
  assert(
    text.includes('test -n "${NVD_API_KEY:-}"'),
    'doctor should test -n for NVD_API_KEY'
  )
})

test('commands avoid dangerous default scan scope', () => {
  const all = [
    'scan', 'ci-gate', 'fix-plan', 'why',
    'doctor', 'quick-scan', 'report', 'baseline-create', 'baseline-review'
  ]
  for (const name of all) {
    const text = readText(`claude-plugin/commands/${name}.md`)
    const bashBlocks = text.match(/```bash[\s\S]*?```/g) || []
    for (const block of bashBlocks) {
      assert(!block.includes('--global'), `${name}.md should not default to --global`)
      assert(!block.includes('--all-drives'), `${name}.md should not default to --all-drives`)
      assert(!block.includes('sudo '), `${name}.md should not use sudo`)
    }
  }
})

test('no command injects --fix into executable bash blocks', () => {
  const all = [
    'scan', 'ci-gate', 'fix-plan', 'why',
    'doctor', 'quick-scan', 'report', 'baseline-create', 'baseline-review'
  ]
  for (const name of all) {
    const text = readText(`claude-plugin/commands/${name}.md`)
    const bashBlocks = text.match(/```bash[\s\S]*?```/g) || []
    for (const block of bashBlocks) {
      assert(
        !block.includes('--fix'),
        `${name}.md executable bash blocks must not contain --fix`
      )
    }
  }
})

test('only baseline-create writes a baseline file', () => {
  const writers = ['scan', 'ci-gate', 'fix-plan', 'why', 'doctor', 'quick-scan', 'report', 'baseline-review']
  for (const name of writers) {
    const text = readText(`claude-plugin/commands/${name}.md`)
    const bashBlocks = text.match(/```bash[\s\S]*?```/g) || []
    for (const block of bashBlocks) {
      assert(!block.includes('--write-baseline'), `${name}.md should not write baseline`)
    }
  }
  const bctext = readText('claude-plugin/commands/baseline-create.md')
  assert(bctext.includes('--write-baseline'), 'baseline-create should write baseline')
})

test('only report command writes export artifacts in defaults', () => {
  const nonReporters = ['scan', 'fix-plan', 'why', 'doctor', 'quick-scan', 'baseline-create', 'baseline-review']
  for (const name of nonReporters) {
    const text = readText(`claude-plugin/commands/${name}.md`)
    const bashBlocks = text.match(/```bash[\s\S]*?```/g) || []
    for (const block of bashBlocks) {
      assert(!block.includes('--export-html'), `${name}.md should not export-html by default`)
      assert(!block.includes('--export-json'), `${name}.md should not export-json by default`)
      assert(!block.includes('--export-sarif'), `${name}.md should not export-sarif by default`)
    }
  }
})

test('new command files have frontmatter with description', () => {
  const commands = ['doctor', 'quick-scan', 'report', 'baseline-create', 'baseline-review']
  for (const name of commands) {
    const text = readText(`claude-plugin/commands/${name}.md`)
    assert(text.startsWith('---\n'), `${name}.md should start with frontmatter`)
    assert(text.includes('description:'), `${name}.md should have a description field`)
    assert(text.includes('allowed-tools:'), `${name}.md should declare allowed-tools`)
  }
})

test('new command files reference eco-guardian via npx', () => {
  const commands = ['doctor', 'quick-scan', 'report', 'baseline-create', 'baseline-review']
  for (const name of commands) {
    const text = readText(`claude-plugin/commands/${name}.md`)
    assert(
      text.includes('npx -y github:boredom1234/eco-guardian'),
      `${name}.md should call eco-guardian via npx`
    )
  }
})

test('new command files handle exit codes and always exit 0', () => {
  const commands = ['quick-scan', 'report', 'baseline-create', 'baseline-review']
  for (const name of commands) {
    const text = readText(`claude-plugin/commands/${name}.md`)
    assert(text.includes('eco-guardian exit code: $status'), `${name}.md should echo exit code`)
    assert(text.includes('exit 0'), `${name}.md should end bash blocks with exit 0`)
    assert(text.includes('status=$?'), `${name}.md should capture exit code`)
  }
})

test('new command files have argument-hint in frontmatter', () => {
  const commands = ['quick-scan', 'report', 'baseline-create', 'baseline-review']
  for (const name of commands) {
    const text = readText(`claude-plugin/commands/${name}.md`)
    assert(text.includes('argument-hint:'), `${name}.md should have an argument-hint field`)
  }
})

test('new command files include shell injection guard before bash blocks', () => {
  const commands = ['quick-scan', 'report', 'baseline-create', 'baseline-review']
  for (const name of commands) {
    const text = readText(`claude-plugin/commands/${name}.md`)
    assert(
      text.includes('shell control operators'),
      `${name}.md should warn about shell control operators`
    )
    assert(
      text.includes('plain eco-guardian flags only'),
      `${name}.md should ask for plain flags when injection is suspected`
    )
  }
})

test('all command files end with a newline (expanded)', () => {
  const commands = ['scan', 'ci-gate', 'fix-plan', 'why', 'doctor', 'quick-scan', 'report', 'baseline-create', 'baseline-review']
  for (const name of commands) {
    const text = readText(`claude-plugin/commands/${name}.md`)
    assert(text.endsWith('\n'), `${name}.md should end with a trailing newline`)
  }
})

test('vulnerability triage skill exists and is instruction-only', () => {
  const text = readText('claude-plugin/skills/vulnerability-triage/SKILL.md')
  assert(text.startsWith('---\n'), 'skill should start with frontmatter')
  assert(text.includes('name: vulnerability-triage'), 'skill should declare name')
  assert(text.includes('description:'), 'skill should have description')
  assert(!text.includes('allowed-tools:'), 'skill should not declare allowed-tools (instruction-only)')
  assert(text.includes('Prioritization'), 'skill should include prioritization guidance')
  assert(text.includes('exit codes:'), 'skill should document exit codes')
  assert(text.includes('Baseline awareness'), 'skill should document baseline behavior')
})

test('README lists all expected plugin commands', () => {
  const readme = readText('README.md')
  const expectedCommands = [
    'scan',
    'ci-gate',
    'fix-plan',
    'why',
    'doctor',
    'quick-scan',
    'report',
    'baseline-create',
    'baseline-review'
  ]
  for (const name of expectedCommands) {
    assert(
      readme.includes(`/eco-guardian:${name}`),
      `README should mention /eco-guardian:${name}`
    )
  }
})

// --- plugin CLAUDE.md ---

test('CLAUDE.md exists at plugin root', () => {
  assert(fs.existsSync(path.join(__dirname, 'claude-plugin', 'CLAUDE.md')))
})

test('CLAUDE.md documents exit codes and severity ordering', () => {
  const text = readText('claude-plugin/CLAUDE.md')
  assert(text.includes('Exit codes'), 'should mention exit codes')
  assert(text.includes('critical > high > moderate > low'), 'should document severity order')
  assert(text.includes('SARIF'), 'should mention SARIF')
})

// --- dependency-manifest-watcher skill ---

test('dependency-manifest-watcher skill exists with correct frontmatter', () => {
  const text = readText('claude-plugin/skills/dependency-manifest-watcher/SKILL.md')
  assert(text.startsWith('---\n'), 'skill should start with frontmatter')
  assert(text.includes('name: dependency-manifest-watcher'), 'skill should declare name')
  assert(text.includes('description:'), 'skill should have description')
  assert(text.includes('user-invocable: false'), 'skill should not be user-invocable')
})

test('dependency-manifest-watcher references eco-guardian:scan', () => {
  const text = readText('claude-plugin/skills/dependency-manifest-watcher/SKILL.md')
  assert(text.includes('/eco-guardian:scan'), 'should reference eco-guardian scan command')
})

// --- agent files ---

test('agent files exist for fix-reviewer and dep-interceptor', () => {
  assert(
    fs.existsSync(path.join(__dirname, 'claude-plugin', 'agents', 'fix-reviewer.md')),
    'fix-reviewer agent should exist'
  )
  assert(
    fs.existsSync(path.join(__dirname, 'claude-plugin', 'agents', 'dep-interceptor.md')),
    'dep-interceptor agent should exist'
  )
})

test('agent fix-reviewer has name, description, and allowed-tools', () => {
  const text = readText('claude-plugin/agents/fix-reviewer.md')
  assert(text.startsWith('---\n'), 'agent should start with frontmatter')
  assert(text.includes('name: fix-reviewer'), 'agent should declare name')
  assert(text.includes('description:'), 'agent should have description')
  assert(text.includes('allowed-tools:'), 'agent should declare allowed-tools')
})

test('agent fix-reviewer references eco-guardian via npx', () => {
  const text = readText('claude-plugin/agents/fix-reviewer.md')
  assert(
    text.includes('npx -y github:boredom1234/eco-guardian'),
    'fix-reviewer should call eco-guardian via npx'
  )
})

test('agent dep-interceptor has name, description, and allowed-tools', () => {
  const text = readText('claude-plugin/agents/dep-interceptor.md')
  assert(text.startsWith('---\n'), 'agent should start with frontmatter')
  assert(text.includes('name: dep-interceptor'), 'agent should declare name')
  assert(text.includes('description:'), 'agent should have description')
  assert(text.includes('allowed-tools:'), 'agent should declare allowed-tools')
})

test('agent dep-interceptor mentions fail-open behavior', () => {
  const text = readText('claude-plugin/agents/dep-interceptor.md')
  assert(text.includes('fail') || text.includes('never block'), 'should document fail-open behavior')
})

// --- hooks ---

test('hooks.json exists and is valid JSON', () => {
  const hooks = readJson('claude-plugin/hooks/hooks.json')
  assert(typeof hooks.hooks === 'object' && hooks.hooks !== null, 'should have hooks object')
  assert(Array.isArray(hooks.hooks.PreToolUse), 'should have PreToolUse array')
  assert(hooks.hooks.PreToolUse.length > 0, 'should have at least one hook entry')
})

test('hooks.json has Bash matcher with command hook', () => {
  const hooks = readJson('claude-plugin/hooks/hooks.json')
  const entry = hooks.hooks.PreToolUse.find((e) => e.matcher === 'Bash')
  assert(entry, 'should have a Bash matcher entry')
  assert(Array.isArray(entry.hooks), 'should have hooks array')
  assert(entry.hooks[0].type === 'command', 'hook should be type command')
  assert(
    entry.hooks[0].command.includes('check-install.js'),
    'hook should invoke check-install.js'
  )
})

test('hooks.json top-level has exactly one key (hooks)', () => {
  const raw = readJson('claude-plugin/hooks/hooks.json')
  const keys = Object.keys(raw)
  assert.strictEqual(keys.length, 1, 'should have exactly one top-level key')
  assert.strictEqual(keys[0], 'hooks', 'top-level key should be "hooks"')
})

test('hooks object is a record not an array', () => {
  const raw = readJson('claude-plugin/hooks/hooks.json')
  assert(typeof raw.hooks === 'object', 'hooks should be an object')
  assert(!Array.isArray(raw.hooks), 'hooks should not be an array')
  assert(raw.hooks !== null, 'hooks should not be null')
})

test('hooks.json PreToolUse entries have required fields', () => {
  const hooks = readJson('claude-plugin/hooks/hooks.json')
  for (const entry of hooks.hooks.PreToolUse) {
    assert(typeof entry.matcher === 'string' && entry.matcher.length > 0, 'matcher should be a non-empty string')
    assert(Array.isArray(entry.hooks), 'hooks should be an array')
    assert(entry.hooks.length > 0, 'hooks array should not be empty')
    for (const hook of entry.hooks) {
      assert(typeof hook.type === 'string' && hook.type.length > 0, 'hook type should be a non-empty string')
      assert(typeof hook.command === 'string' && hook.command.length > 0, 'hook command should be a non-empty string')
    }
  }
})

test('hooks.json hook entries have valid timeout', () => {
  const hooks = readJson('claude-plugin/hooks/hooks.json')
  for (const entry of hooks.hooks.PreToolUse) {
    for (const hook of entry.hooks) {
      if (hook.timeout !== undefined) {
        assert(typeof hook.timeout === 'number', 'timeout should be a number')
        assert(hook.timeout > 0, 'timeout should be positive')
        assert(Number.isFinite(hook.timeout), 'timeout should be finite')
      }
    }
  }
})

test('hooks.json has no duplicate event types in PreToolUse', () => {
  const hooks = readJson('claude-plugin/hooks/hooks.json')
  const matchers = hooks.hooks.PreToolUse.map((e) => e.matcher)
  const unique = [...new Set(matchers)]
  assert.strictEqual(matchers.length, unique.length, 'should have no duplicate matchers')
})

test('hooks.json command references a .js file', () => {
  const hooks = readJson('claude-plugin/hooks/hooks.json')
  for (const entry of hooks.hooks.PreToolUse) {
    for (const hook of entry.hooks) {
      assert(hook.command.endsWith('.js"') || hook.command.endsWith('.js'),
        'command should reference a .js file')
    }
  }
})

test('hooks.json uses CLAUDE_PLUGIN_DIR variable in command', () => {
  const hooks = readJson('claude-plugin/hooks/hooks.json')
  for (const entry of hooks.hooks.PreToolUse) {
    for (const hook of entry.hooks) {
      assert(
        hook.command.includes('${CLAUDE_PLUGIN_DIR}') || hook.command.includes('$CLAUDE_PLUGIN_DIR'),
        'command should use CLAUDE_PLUGIN_DIR variable'
      )
    }
  }
})

test('check-install.js exists', () => {
  assert(
    fs.existsSync(path.join(__dirname, 'claude-plugin', 'hooks', 'check-install.js')),
    'check-install.js should exist'
  )
})

test('check-install.js handles at least 3 package managers', () => {
  const text = readText('claude-plugin/hooks/check-install.js')
  const pmMatches = text.match(/npm|pip\d?|cargo|gem|go|composer/g) || []
  const unique = [...new Set(pmMatches.filter((m) => m !== 'go'))]
  assert(unique.length >= 3, 'should handle at least 3 package managers')
})

test('check-install.js always exits with code 0', () => {
  const text = readText('claude-plugin/hooks/check-install.js')
  const exitCalls = text.match(/process\.exit\((\d+)\)/g) || []
  for (const call of exitCalls) {
    assert(call === 'process.exit(0)', `all exit calls should be 0, found: ${call}`)
  }
})

test('check-install.js skips flag-like package names', () => {
  const text = readText('claude-plugin/hooks/check-install.js')
  assert(text.includes("startsWith('-')"), 'should skip args starting with dash')
})

test('check-install.js handles JSON parse failure gracefully', () => {
  const text = readText('claude-plugin/hooks/check-install.js')
  assert(text.includes('catch'), 'should have try/catch for JSON parse')
  assert(text.includes('JSON.parse'), 'should parse stdin JSON')
})

// --- daily-scan.js ---

test('daily-scan.js exists', () => {
  assert(
    fs.existsSync(path.join(__dirname, 'claude-plugin', 'hooks', 'daily-scan.js')),
    'daily-scan.js should exist'
  )
})

test('daily-scan.js always exits with code 0', () => {
  const text = readText('claude-plugin/hooks/daily-scan.js')
  const exitCalls = text.match(/process\.exit\((\d+)\)/g) || []
  for (const call of exitCalls) {
    assert(call === 'process.exit(0)', `all exit calls should be 0, found: ${call}`)
  }
})

test('daily-scan.js reads CLAUDE_PLUGIN_DATA environment variable', () => {
  const text = readText('claude-plugin/hooks/daily-scan.js')
  assert(text.includes('CLAUDE_PLUGIN_DATA'), 'should read CLAUDE_PLUGIN_DATA env var')
  assert(text.includes('process.env.CLAUDE_PLUGIN_DATA'), 'should access via process.env')
})

test('daily-scan.js checks timestamp file before scanning', () => {
  const text = readText('claude-plugin/hooks/daily-scan.js')
  assert(text.includes('.last-scan-ts'), 'should use .last-scan-ts stamp file')
  assert(text.includes('getLastScanTime'), 'should have getLastScanTime function')
  assert(text.includes('readFileSync'), 'should read timestamp file')
})

test('daily-scan.js writes timestamp after successful scan', () => {
  const text = readText('claude-plugin/hooks/daily-scan.js')
  assert(text.includes('setLastScanTime'), 'should have setLastScanTime function')
  assert(text.includes('writeFileSync'), 'should write timestamp file')
  assert(text.includes('Date.now'), 'should use current timestamp')
})

test('daily-scan.js uses 24-hour scan interval', () => {
  const text = readText('claude-plugin/hooks/daily-scan.js')
  assert(text.includes('SCAN_INTERVAL_MS'), 'should define scan interval constant')
  assert(text.includes('24 * 60 * 60 * 1000'), 'should be 24 hours in milliseconds')
})

test('daily-scan.js outputs additionalContext in correct format', () => {
  const text = readText('claude-plugin/hooks/daily-scan.js')
  assert(text.includes('additionalContext'), 'should output additionalContext')
  assert(text.includes('hookSpecificOutput'), 'should wrap in hookSpecificOutput')
  assert(text.includes('hookEventName'), 'should include hookEventName')
  assert(text.includes('SessionStart'), 'should reference SessionStart event')
})

test('daily-scan.js runs eco-guardian with correct arguments', () => {
  const text = readText('claude-plugin/hooks/daily-scan.js')
  assert(text.includes('github:boredom1234/eco-guardian'), 'should use correct package')
  assert(text.includes('--ecosystems'), 'should pass --ecosystems flag')
  assert(text.includes('scan-all'), 'should scan all ecosystems')
  assert(text.includes('--json'), 'should output JSON')
  assert(text.includes("'--banner'"), 'should disable banner')
  assert(text.includes("'off'"), 'should pass off value')
  assert(text.includes('--no-cache'), 'should disable cache')
})

test('daily-scan.js handles eco-guardian failure gracefully', () => {
  const text = readText('claude-plugin/hooks/daily-scan.js')
  assert(text.includes('catch'), 'should have try/catch for eco-guardian execution')
  assert(text.includes('fail open'), 'should fail open on error')
})

test('daily-scan.js handles empty findings', () => {
  const text = readText('claude-plugin/hooks/daily-scan.js')
  assert(text.includes('findings.length === 0'), 'should handle empty findings')
  assert(text.includes('process.exit(0)'), 'should exit cleanly with no findings')
})

test('daily-scan.js limits summary to 10 findings', () => {
  const text = readText('claude-plugin/hooks/daily-scan.js')
  assert(text.includes('slice(0, 10)'), 'should limit summary to 10 findings')
  assert(text.includes('...and'), 'should indicate when more findings exist')
})

test('daily-scan.js handles missing CLAUDE_PLUGIN_DATA gracefully', () => {
  const text = readText('claude-plugin/hooks/daily-scan.js')
  assert(text.includes("process.env.CLAUDE_PLUGIN_DATA || ''"), 'should default to empty string')
  assert(text.includes('if (!dataDir)'), 'should check for empty dataDir')
})

test('daily-scan.js creates data directory if missing', () => {
  const text = readText('claude-plugin/hooks/daily-scan.js')
  assert(text.includes('mkdirSync'), 'should create directory')
  assert(text.includes('recursive: true'), 'should use recursive option')
})

test('daily-scan.js handles timestamp read failure gracefully', () => {
  const text = readText('claude-plugin/hooks/daily-scan.js')
  assert(text.includes('parseInt'), 'should parse timestamp as integer')
  assert(text.includes('Number.isFinite'), 'should validate parsed timestamp')
  assert(text.includes('return 0'), 'should return 0 on invalid timestamp')
})

test('hooks.json has SessionStart hook with async flag', () => {
  const hooks = readJson('claude-plugin/hooks/hooks.json')
  assert(Array.isArray(hooks.hooks.SessionStart), 'should have SessionStart array')
  assert(hooks.hooks.SessionStart.length > 0, 'should have at least one SessionStart entry')
  const entry = hooks.hooks.SessionStart[0]
  assert(entry.matcher === '*', 'should match all session starts')
  assert(entry.hooks[0].async === true, 'should run async')
  assert(entry.hooks[0].type === 'command', 'should be command type')
  assert(entry.hooks[0].command.includes('daily-scan.js'), 'should invoke daily-scan.js')
})

test('hooks.json SessionStart hook has reasonable timeout', () => {
  const hooks = readJson('claude-plugin/hooks/hooks.json')
  const entry = hooks.hooks.SessionStart[0]
  assert(typeof entry.hooks[0].timeout === 'number', 'timeout should be a number')
  assert(entry.hooks[0].timeout >= 60000, 'timeout should be at least 60s')
  assert(entry.hooks[0].timeout <= 300000, 'timeout should be at most 300s')
})
