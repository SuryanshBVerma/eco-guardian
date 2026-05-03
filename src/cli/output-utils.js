"use strict";

const { COLORS } = require("../config/constants");

function colorize(color, text) {
  return `${color}${text}${COLORS.reset}`;
}

module.exports = {
  colorize,
};
