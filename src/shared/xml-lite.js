"use strict";

function stripComments(text) {
  return String(text || "").replace(/<!--[\s\S]*?-->/g, "");
}

function extractTagText(xml, tagName) {
  if (!xml) return null;
  const cleaned = stripComments(xml);
  const openTag = `<${tagName}>`;
  const openIndex = cleaned.indexOf(openTag);
  if (openIndex === -1) return null;
  const closeTag = `</${tagName}>`;
  const closeIndex = cleaned.indexOf(closeTag, openIndex + openTag.length);
  if (closeIndex === -1) return null;
  return cleaned.slice(openIndex + openTag.length, closeIndex).trim();
}

function extractAllElements(xml, tagName) {
  if (!xml) return [];
  const cleaned = stripComments(xml);
  const results = [];
  let pos = 0;
  while (true) {
    const startIdx = cleaned.indexOf(`<${tagName}`, pos);
    if (startIdx === -1) break;

    const nextChar = cleaned[startIdx + tagName.length + 1];
    if (
      nextChar !== ">" &&
      nextChar !== " " &&
      nextChar !== "\n" &&
      nextChar !== "\r" &&
      nextChar !== "\t" &&
      nextChar !== "/"
    ) {
      pos = startIdx + 1;
      continue;
    }

    const openEndIdx = cleaned.indexOf(">", startIdx);
    if (openEndIdx === -1) break;

    if (cleaned[openEndIdx - 1] === "/") {
      results.push(cleaned.slice(startIdx, openEndIdx + 1));
      pos = openEndIdx + 1;
      continue;
    }

    const closeTag = `</${tagName}>`;
    const closeIdx = cleaned.indexOf(closeTag, openEndIdx);
    if (closeIdx === -1) break;

    results.push(cleaned.slice(startIdx, closeIdx + closeTag.length));
    pos = closeIdx + closeTag.length;
  }
  return results;
}

function extractAttr(elementBody, attrName) {
  if (!elementBody) return null;
  const attrRegex = new RegExp(`\\s${attrName}="([^"]*)"`, "i");
  let match = elementBody.match(attrRegex);
  if (match) return match[1];

  const attrSingleRegex = new RegExp(`\\s${attrName}='([^']*)'`, "i");
  match = elementBody.match(attrSingleRegex);
  if (match) return match[1];

  return null;
}

module.exports = {
  stripComments,
  extractTagText,
  extractAllElements,
  extractAttr,
};
