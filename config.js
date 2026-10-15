"use strict";

globalThis.MONEYCRAFT_CONFIG = Object.freeze({
  apiBaseUrl: ["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? "http://127.0.0.1:49180"
    : "",
});
