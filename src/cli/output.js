"use strict";

const { COLORS, LEVEL_META } = require("../config/constants");

function colorize(color, text) {
  return `${color}${text}${COLORS.reset}`;
}

function printBanner(options) {
  if (options.json) return;
  const lines = [
    " __    _  _______  __   __    _______  __   __  _______  ______    ______   ___   _______  __    _ ",
    "|  |  | ||       ||  |_|  |  |       ||  | |  ||   _   ||    _ |  |      | |   | |   _   ||  |  | |",
    "|   |_| ||    _  ||       |  |    ___||  | |  ||  |_|  ||   | ||  |  _    ||   | |  |_|  ||   |_| |",
    "|       ||   |_| ||       |  |   | __ |  |_|  ||       ||   |_||_ | | |   ||   | |       ||       |",
    "|  _    ||    ___||       |  |   ||  ||       ||       ||    __  || |_|   ||   | |       ||  _    |",
    "| | |   ||   |    | ||_|| |  |   |_| ||       ||   _   ||   |  | ||       ||   | |   _   || | |   |",
    "|_|  |__||___|    |_|   |_|  |_______||_______||__| |__||___|  |_||______| |___| |__| |__||_|  |__|",
  ];
  process.stderr.write(`${colorize(COLORS.cyan, lines.join("\n"))}\n`);
}

function log(level, message, options) {
  if (options && options.json) return;
  const meta = LEVEL_META[level] || LEVEL_META.info;
  process.stderr.write(`${colorize(meta.color, meta.icon)} ${message}\n`);
}

module.exports = {
  colorize,
  printBanner,
  log,
};
