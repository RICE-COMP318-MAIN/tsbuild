"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/loadenv.ts
var loadenv_exports = {};
__export(loadenv_exports, {
  loadEnv: () => loadEnv
});
module.exports = __toCommonJS(loadenv_exports);
var import_node_fs = require("node:fs");
var import_node_path = require("node:path");
var defaultEnvFile = ".env";
var localEnvFile = ".env.local";
var testingEnvFile = ".env.test";
function loadEnvFile(filePath) {
  const env = {};
  const absolutePath = (0, import_node_path.resolve)(filePath);
  if (!(0, import_node_fs.existsSync)(absolutePath)) {
    return env;
  }
  const fileContents = (0, import_node_fs.readFileSync)(absolutePath, { encoding: "utf8" });
  const lines = fileContents.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) {
      continue;
    }
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}
function loadEnv(testing = false) {
  const override = testing ? testingEnvFile : localEnvFile;
  const env = loadEnvFile(defaultEnvFile);
  const overrideEnv = loadEnvFile(override);
  for (const key in overrideEnv) {
    env[key] = overrideEnv[key];
  }
  return env;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  loadEnv
});
