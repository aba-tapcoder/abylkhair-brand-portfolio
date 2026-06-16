import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";

const port = 9334;
const profile = "/tmp/portfolio-cdp-inspect";
await rm(profile, { recursive: true, force: true });
await mkdir(profile, { recursive: true });

const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless=new",
  "--disable-gpu",
  "--disable-extensions",
  "--no-first-run",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  "about:blank",
], { stdio: "ignore" });

async function poll(url) {
  for (let index = 0; index < 80; index += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Chrome did not start");
}

const pages = await poll(`http://127.0.0.1:${port}/json/list`);
const page = pages.find((entry) => entry.type === "page" && !entry.url.startsWith("chrome-extension://"));
if (!page) throw new Error("No inspectable page target");
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let id = 0;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(String(event.data));
  const handler = pending.get(message.id);
  if (!handler) return;
  pending.delete(message.id);
  handler(message);
});

function send(method, params = {}) {
  const messageId = ++id;
  socket.send(JSON.stringify({ id: messageId, method, params }));
  return new Promise((resolve) => pending.set(messageId, resolve));
}

async function evalValue(expression) {
  const response = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (response.error) throw new Error(response.error.message);
  if (!response.result?.result || response.result.result.value === undefined) {
    console.error("Unexpected Runtime.evaluate response", JSON.stringify(response));
  }
  return response.result.result.value;
}

async function inspect(width, height, url) {
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 600,
  });
  await send("Page.navigate", { url });
  await new Promise((resolve) => setTimeout(resolve, 300));
  let state;
  for (let index = 0; index < 80; index += 1) {
    state = await evalValue(`({ href: location.href, ready: document.readyState })`);
    if (state.href === url && state.ready === "complete") break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (!state || state.href !== url) console.error("Navigation state", state, "expected", url);
  return evalValue(`({
    viewport: [innerWidth, innerHeight],
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.getBoundingClientRect().width,
    title: document.title,
    menuDisplay: getComputedStyle(document.querySelector('.menu-toggle')).display,
    whatsappLinks: Array.from(document.querySelectorAll('a[href*="wa.me"]')).map((link) => link.href),
    languageHref: document.querySelector('[data-language]')?.getAttribute('href'),
    imageErrors: Array.from(document.images).filter((image) => image.complete && image.naturalWidth === 0).map((image) => image.src)
  })`);
}

const desktop = await inspect(1440, 1100, "http://127.0.0.1:4321/ru/");
const mobile = await inspect(390, 844, "http://127.0.0.1:4321/ru/");
const menu = await evalValue(`(() => {
  document.querySelector('.menu-toggle').click();
  return {
    expanded: document.querySelector('.menu-toggle').getAttribute('aria-expanded'),
    navDisplay: getComputedStyle(document.querySelector('.main-nav')).display,
    bodyLocked: document.body.classList.contains('nav-open')
  };
})()`);
const kazakh = await inspect(1440, 1100, "http://127.0.0.1:4321/kz/");
const casePage = await inspect(1440, 1100, "http://127.0.0.1:4321/ru/projects/dala-camp/");

console.log(JSON.stringify({ desktop, mobile, menu, kazakh, casePage }, null, 2));
socket.close();
chrome.kill("SIGTERM");
