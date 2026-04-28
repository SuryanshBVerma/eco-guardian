'use strict'

const { log } = require('../cli/output')

class EventQueue {
  constructor (options, snapshot, processFn) {
    this.options = options
    this.snapshot = snapshot
    this.processFn = processFn
    this.dirtyProjects = new Set()
    this.timer = null
    this.running = false
    this.debounceMs = options.watchDebounceMs || 1500
  }

  markDirty (projectKey) {
    if (!projectKey) return
    this.dirtyProjects.add(projectKey)
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.flush(), this.debounceMs)
  }

  async flush () {
    if (this.running || this.dirtyProjects.size === 0) return
    this.running = true
    const batch = Array.from(this.dirtyProjects)
    this.dirtyProjects.clear()

    try {
      await this.processFn(batch)
    } catch (error) {
      log(
        'error',
        `Error processing dirty projects: ${error.message}`,
        this.options
      )
    } finally {
      this.running = false
      if (this.dirtyProjects.size > 0) {
        this.timer = setTimeout(() => this.flush(), this.debounceMs)
      }
    }
  }

  runForever () {
    return new Promise(() => {
      log('success', 'eco-guardian watch service is active.', this.options)
      log('info', 'Press Ctrl+C to stop.', this.options)
    })
  }
}

function startEventQueue (options, snapshot, processFn) {
  return new EventQueue(options, snapshot, processFn)
}

module.exports = { startEventQueue }
