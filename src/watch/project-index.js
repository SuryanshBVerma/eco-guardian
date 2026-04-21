"use strict";

function buildProjectIndex(inputs) {
  const index = {}; // path -> input metadata
  const projectToInputs = {}; // projectRoot:ecosystem -> [input metadata]

  for (const input of inputs) {
    index[input.path] = input;
    const key = `${input.projectRoot}|${input.ecosystem}`;
    if (!projectToInputs[key]) projectToInputs[key] = [];
    projectToInputs[key].push(input);
  }

  return { index, projectToInputs };
}

module.exports = { buildProjectIndex };
