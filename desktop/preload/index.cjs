const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("akari", {
  platform: process.platform
});
