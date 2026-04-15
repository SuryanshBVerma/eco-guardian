'use strict';

const fs = require('fs');
const { loadWatchState, bootstrapState, saveWatchState } = require('./state-store');
const { buildProjectIndex } = require('./project-index');
const { startEventQueue } = require('./event-queue');
const { reconcileLoop } = require('./reconcile');
const { processDirtyProjects } = require('./alerts');
const { quickFingerprint } = require('./fingerprint');
const { log } = require('../cli/output');

async function startWatchService(options, runtimeState = {}) {
  let snapshot = null;
  const savedState = await loadWatchState(options.stateFile);
  
  if (savedState) {
    log('info', 'Resuming from saved watch state...', options);
    snapshot = savedState;
  } else {
    log('info', 'Bootstrapping watch state...', options);
    snapshot = await bootstrapState(options, runtimeState);
  }
  
  const { index, projectToInputs } = buildProjectIndex(snapshot.inputs);
  
  const queue = startEventQueue(options, snapshot, async (batch) => {
    await processDirtyProjects(snapshot, batch, options);
  });

  // Start watching files
  for (const input of snapshot.inputs) {
    if (input.isDir) continue; // Do not watch node_modules directly (causes feedback loops)

    try {
      fs.watch(input.path, async (event, filename) => {
        if (event === 'change' || event === 'rename') {
          const currentFp = await quickFingerprint(input.path);
          if (currentFp !== snapshot.inputFingerprints[input.path]) {
            snapshot.inputFingerprints[input.path] = currentFp;
            const projectKey = `${input.projectRoot}|${input.ecosystem}`;
            queue.markDirty(projectKey);
          }
        }
      });
    } catch (e) {
      log('warn', `Could not watch file: ${input.path}`, options);
    }
  }

  reconcileLoop(options, snapshot, queue);

  return queue.runForever();
}

module.exports = { startWatchService };
