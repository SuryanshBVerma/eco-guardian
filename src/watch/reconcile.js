'use strict';

const { log } = require('../cli/output');
const { quickFingerprint } = require('./fingerprint');
const { buildProjectIndex } = require('./project-index');

async function reconcileLoop(options, snapshot, queue) {
  const interval = (options.reconcileInterval || 900) * 1000;
  
  const tick = async () => {
    log('info', 'Performing background reconciliation pass...', options);
    const { index, projectToInputs } = buildProjectIndex(snapshot.inputs);
    
    for (const [path, input] of Object.entries(index)) {
      const currentFp = await quickFingerprint(path);
      if (currentFp !== snapshot.inputFingerprints[path]) {
        log('info', `Reconcile detected change in: ${path}`, options);
        snapshot.inputFingerprints[path] = currentFp;
        const projectKey = `${input.projectRoot}|${input.ecosystem}`;
        queue.markDirty(projectKey);
      }
    }
    
    setTimeout(tick, interval);
  };

  setTimeout(tick, interval);
}

module.exports = { reconcileLoop };
