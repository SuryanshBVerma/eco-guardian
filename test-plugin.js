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
  const expected = ['scan', 'ci-gate', 'fix-plan', 'why']
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
