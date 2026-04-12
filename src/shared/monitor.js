"use strict";

const { colorize } = require("../cli/output");
const { COLORS } = require("../config/constants");

class ResourceMonitor {
  constructor(options = {}) {
    this.options = options;
    this.interval = null;
    this.peakRss = 0;
    this.startTime = Date.now();
    this.startUsage = process.cpuUsage();
    this.hrStartTime = process.hrtime();
    this.samples = 0;
    this.totalCpuPercent = 0;
  }

  start() {
    if (this.options.json || !process.stderr.isTTY) return;

    this.interval = setInterval(() => {
      this.sample();
    }, 500);
  }

  sample() {
    const mem = process.memoryUsage();
    const rss = mem.rss;
    if (rss > this.peakRss) this.peakRss = rss;

    const currentUsage = process.cpuUsage(this.startUsage);
    const hrCurrentTime = process.hrtime(this.hrStartTime);

    // Reset for next sample
    this.startUsage = process.cpuUsage();
    this.hrStartTime = process.hrtime();

    const elapsedMs = hrCurrentTime[0] * 1000 + hrCurrentTime[1] / 1000000;
    const usageMs = (currentUsage.user + currentUsage.system) / 1000;
    const cpuPercent = elapsedMs > 0 ? (usageMs / elapsedMs) * 100 : 0;

    this.samples += 1;
    this.totalCpuPercent += cpuPercent;

    if (!this.options.json && process.stderr.isTTY) {
      const ramMb = (rss / 1024 / 1024).toFixed(1);
      const cpuFmt = cpuPercent.toFixed(1);
      process.stderr.write(
        `\r${colorize(COLORS.gray, "[MONITOR]")} RAM: ${ramMb} MB | CPU: ${cpuFmt}%   `,
      );
    }
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      // Clear the monitor line
      if (!this.options.json && process.stderr.isTTY) {
        process.stderr.write("\r" + " ".repeat(50) + "\r");
      }
    }

    return {
      peakRssMb: (this.peakRss / 1024 / 1024).toFixed(1),
      avgCpuPercent:
        this.samples > 0
          ? (this.totalCpuPercent / this.samples).toFixed(1)
          : "0.0",
      durationS: ((Date.now() - this.startTime) / 1000).toFixed(1),
    };
  }
}

module.exports = { ResourceMonitor };
