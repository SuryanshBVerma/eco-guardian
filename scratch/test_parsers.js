"use strict";

const {
  parseRequirementsTxt,
  parsePipfileLock,
  parsePoetryLock,
} = require("../src/scan/python");
const { parseGoMod } = require("../src/scan/go");

const reqTxt = `
requests==2.28.1
numpy==1.23.5 # some comment
# commented==1.0.0
django>=3.2 # skipping since not ==
`;

const pipfileLock = JSON.stringify({
  default: {
    requests: { version: "==2.28.1" },
  },
  develop: {
    pytest: { version: "==7.1.2" },
  },
});

const poetryLock = `
[[package]]
name = "aiohttp"
version = "3.8.3"

[[package]]
name = "multidict"
version = "6.0.2"
`;

const goMod = `
module test

require (
    github.com/google/uuid v1.3.0
    github.com/sirupsen/logrus v1.8.1 // indirect
)

require github.com/stretchr/testify v1.7.0
`;

console.log("--- Python requirements.txt ---");
console.log(JSON.stringify(parseRequirementsTxt(reqTxt, "req.txt"), null, 2));

console.log("\n--- Python Pipfile.lock ---");
console.log(JSON.stringify(parsePipfileLock(pipfileLock, "pip.lock"), null, 2));

console.log("\n--- Python poetry.lock ---");
console.log(
  JSON.stringify(parsePoetryLock(poetryLock, "poetry.lock"), null, 2),
);

console.log("\n--- Go go.mod ---");
console.log(JSON.stringify(parseGoMod(goMod, "go.mod"), null, 2));
