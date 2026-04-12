"use strict";

const readline = require("readline");
const {
  THOUGHT_WORDS,
  THOUGHT_BOUNCE_FRAMES,
  COLORS,
} = require("../config/constants");
const { colorize } = require("./output-utils");

class MusingEmitter {
  constructor() {
    this.intervalId = null;
    this.frameId = null;
    this.currentWord = "";
    this.currentFrame = 0;
    this.isActive = false;
  }

  start() {
    if (this.isActive) return;
    this.isActive = true;
    this._pickNewWord();

    // Update word every 3 seconds
    this.intervalId = setInterval(() => {
      this._pickNewWord();
    }, 3000);

    // Update animation every 200ms
    this.frameId = setInterval(() => {
      if (this.isActive) {
        this.currentFrame =
          (this.currentFrame + 1) % THOUGHT_BOUNCE_FRAMES.length;
        this.draw();
      }
    }, 200);
  }

  _pickNewWord() {
    const idx = Math.floor(Math.random() * THOUGHT_WORDS.length);
    this.currentWord = THOUGHT_WORDS[idx];
  }

  draw() {
    if (!this.isActive) return;
    const frame = THOUGHT_BOUNCE_FRAMES[this.currentFrame];
    const icon = colorize(COLORS.cyan, "[VIGIL]");
    const text = `${icon} ${colorize(COLORS.gray, frame)} ${this.currentWord}...`;

    // Use carriage return and clear to ensure a fresh line
    process.stderr.write(`\r${text}\x1b[K`);
  }

  clear() {
    process.stderr.write("\r\x1b[K");
  }

  stop() {
    if (!this.isActive) return;
    clearInterval(this.intervalId);
    clearInterval(this.frameId);
    this.isActive = false;
    this.clear();
  }
}

module.exports = new MusingEmitter();
