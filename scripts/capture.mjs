import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = 9333;
const profile = "/tmp/portfolio-cdp";
const outputDir = path.resolve("qa");

await rm(profile, { recursive: true, force: true });
await mkdir(profile, { recursive: true });
await mkdir(outputDir, { recursive: true });

const processRef = spawn(chrome, [
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  "--no-first-run",
  "--no-default-browser-check",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  "about:blank",
], { stdio: "ignore" });

async function pollJson(url) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Chrome endpoint did not become ready: ${url}`);
}

const pages = await pollJson(`http://127.0.0.1:${port}/json/list`);
const socketUrl = pages[0].webSocketDebuggerUrl;
const socket = new WebSocket(socketUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let messageId = 0;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(String(event.data));
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  }
});

function command(method, params = {}) {
  const id = ++messageId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP command timed out: ${method}`));
    }, 10000);
    pending.set(id, {
      resolve: (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    });
  });
}

async function evaluate(expression) {
  const result = await command("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  return result.result.value;
}

async function waitForReady() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const ready = await evaluate("document.readyState === 'complete'");
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  await evaluate("document.fonts ? document.fonts.ready.then(() => true) : true");
  await evaluate("document.querySelectorAll('img[loading=\"lazy\"]').forEach((image) => image.loading = 'eager'); true");
  await evaluate(`
    Promise.race([
      Promise.all(
        Array.from(document.images).map((image) =>
          image.complete ? true : new Promise((resolve) => {
            image.addEventListener('load', resolve, { once: true });
            image.addEventListener('error', resolve, { once: true });
          })
        )
      ),
      new Promise((resolve) => setTimeout(resolve, 4000))
    ]).then(() => true)
  `);
  await evaluate("document.querySelectorAll('[data-reveal]').forEach((node) => node.classList.add('is-visible')); true");
}

async function navigate(url, width, height) {
  console.log("navigate", url, width, height);
  await command("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 600,
  });
  await command("Page.navigate", { url });
  await waitForReady();
  console.log("ready", url);
}

async function capture(name, { fullPage = false } = {}) {
  let params = { format: "png", fromSurface: true, captureBeyondViewport: true };
  if (fullPage) {
    const metrics = await command("Page.getLayoutMetrics");
    params.clip = {
      x: 0,
      y: 0,
      width: metrics.cssContentSize.width,
      height: metrics.cssContentSize.height,
      scale: 1,
    };
  }
  const result = await command("Page.captureScreenshot", params);
  await writeFile(path.join(outputDir, name), Buffer.from(result.data, "base64"));
  console.log("captured", name);
}

await command("Page.enable");

await navigate("http://127.0.0.1:4321/ru/", 1440, 1100);
await capture("home-desktop-cdp.png");
await capture("home-full-cdp.png", { fullPage: true });
const desktopMetrics = await evaluate(`({
  viewport: [innerWidth, innerHeight],
  scrollWidth: document.documentElement.scrollWidth,
  bodyWidth: document.body.getBoundingClientRect().width,
  whatsappLinks: Array.from(document.querySelectorAll('a[href*="wa.me"]')).map((a) => a.href),
  languageHref: document.querySelector('[data-language]')?.getAttribute('href')
})`);

await navigate("http://127.0.0.1:4321/ru/", 390, 844);
const mobileMetrics = await evaluate(`({
  viewport: [innerWidth, innerHeight],
  scrollWidth: document.documentElement.scrollWidth,
  bodyWidth: document.body.getBoundingClientRect().width,
  menuVisible: getComputedStyle(document.querySelector('.menu-toggle')).display
})`);
await capture("home-mobile-cdp.png");
await evaluate("document.querySelector('.menu-toggle').click(); true");
await capture("home-mobile-menu-cdp.png");

await navigate("http://127.0.0.1:4321/ru/projects/dala-camp/", 1440, 1100);
await capture("dala-case-full-cdp.png", { fullPage: true });

await navigate("http://127.0.0.1:4321/kz/", 1440, 1100);
await capture("home-kz-cdp.png");

console.log(JSON.stringify({ desktopMetrics, mobileMetrics }, null, 2));

socket.close();
processRef.kill("SIGTERM");
