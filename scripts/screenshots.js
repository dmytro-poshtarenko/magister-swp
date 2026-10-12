// Empties the users table, runs the API as a separate process, signs up and
// logs in through Swagger UI, sends a series of requests with different
// outcomes and photographs the logs in Grafana. Screenshots and the server's
// console output go into docs/screenshots/lab-03/.
// Every Swagger request is checked against the expected URL and status code,
// so a screenshot never shows something other than what its file name says.
// Usage: npm run db:up && npm run screenshots
// (CHROME_PATH overrides the Chrome binary, GRAFANA_PORT the Grafana port)

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { createMigrator } from '../src/db/migrator.js';
import { createSequelize } from '../src/db/sequelize.js';

const CHROME =
  process.env.CHROME_PATH ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = fileURLToPath(
  new URL('../docs/screenshots/lab-03/', import.meta.url),
);
const API = `http://localhost:${Number(process.env.PORT) || 3000}`;
const GRAFANA = `http://localhost:${Number(process.env.GRAFANA_PORT) || 3001}`;
const LOGS = '{service="magister-swp"} | json';

const sequelize = createSequelize();
await createMigrator(sequelize).up();
await sequelize.query('TRUNCATE users RESTART IDENTITY');
await sequelize.close();

const consoleOutput = [];
const started = Date.now();
const server = await startServer();
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  defaultViewport: { width: 1100, height: 900, deviceScaleFactor: 1.5 },
});

try {
  await mkdir(OUT, { recursive: true });
  const page = await browser.newPage();
  await page.emulateMediaFeatures([
    { name: 'prefers-color-scheme', value: 'light' },
  ]);

  await openSwagger(page);
  await execute(page, 'auth-register', {
    expect: ['/api/auth/register', 201],
    file: '01-register-201.png',
  });
  await execute(page, 'auth-login', {
    expect: ['/api/auth/login', 200],
    file: '02-login-200.png',
  });
  await execute(page, 'users-listUsers', {
    expect: ['/api/users', 401],
    file: '03-get-users-without-token-401.png',
  });

  const olena = await login('olena@example.com', 'olena-password-2026');
  await authorize(page, olena);
  await execute(page, 'users-listUsers', {
    expect: ['/api/users', 200],
    file: '04-get-users-with-token-200.png',
  });
  await execute(page, 'users-deleteUser', {
    id: '1',
    expect: ['/api/users/1', 403],
    file: '05-delete-user-as-user-403.png',
  });

  await generateTraffic();
  // The Loki transport sends a batch once a second.
  await sleep(2500);

  // Only this run's requests, however many earlier runs Loki holds.
  const range = { from: started - 20_000, to: Date.now() + 10_000 };
  await grafanaExplore(page, range, '06-grafana-explore-logs.png');
  await grafanaDashboard(page, range, '07-grafana-dashboard.png');
} finally {
  await browser.close();
  await stopServer(server);
  await writeFile(`${OUT}console.jsonl`, consoleOutput.join(''));
}
console.log(`Скриншоти і вивід консолі збережено в ${OUT}`);

async function login(email, password) {
  const response = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return (await response.json()).accessToken;
}

// Requests with different outcomes, in several rounds a few seconds apart,
// so the logs and the dashboard have something to show besides the Swagger
// requests.
async function generateTraffic() {
  const admin = await login(
    process.env.ADMIN_EMAIL,
    process.env.ADMIN_PASSWORD,
  );
  const call = (method, path, body, token = admin) =>
    fetch(`${API}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token && { authorization: `Bearer ${token}` }),
      },
      body: body && JSON.stringify(body),
    });

  await call('POST', '/api/users', {
    name: 'Іван Петренко',
    email: 'ivan@example.com',
    age: 31,
  });
  await call('PATCH', '/api/users/3', { age: 32 });
  await call('POST', '/api/users', { name: 'Іван', email: 'IVAN@example.com' });
  await call('DELETE', '/api/users/3');
  for (let round = 0; round < 4; round += 1) {
    await sleep(6000);
    await call('GET', '/api/users');
    await call('GET', `/api/users/${round + 1}`);
    await call('GET', '/api/users/42');
    await call('POST', '/api/users', { name: 'І', email: 'not-an-email' });
    await call('POST', '/api/auth/login', {
      email: 'olena@example.com',
      password: 'wrong-password',
    });
    await call('GET', '/api/users', undefined, 'not-a-token');
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startServer() {
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((resolve, reject) => {
    child.stdout.on('data', (chunk) => {
      consoleOutput.push(chunk.toString());
      if (consoleOutput.join('').includes('Сервер запущено')) resolve();
    });
    child.once('exit', () =>
      reject(new Error(`Сервер не запустився:\n${consoleOutput.join('')}`)),
    );
  });
  return child;
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await once(child, 'exit');
}

async function openSwagger(page) {
  await page.goto(`${API}/docs`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.opblock');
  // The documented response codes make every block very tall; the live
  // response is what matters.
  await page.addStyleTag({
    content: `.responses-table:not(.live-responses-table) { display: none !important; }
      textarea.body-param__text { height: 130px !important; min-height: 0 !important; }`,
  });
}

async function authorize(page, token) {
  await page.click('.auth-wrapper .authorize');
  await page.waitForSelector('.modal-ux .auth-container input');
  await page.type('.modal-ux .auth-container input', token);
  await page.click('.modal-ux .auth-btn-wrapper .authorize');
  await page.waitForSelector('.modal-ux .auth-btn-wrapper .btn-done');
  await page.click('.modal-ux .auth-btn-wrapper .btn-done');
  await page.waitForSelector('.modal-ux', { hidden: true });
}

async function execute(page, operation, { id, body, expect, file }) {
  const block = `#operations-${operation}`;
  if (!(await page.$(`${block}.is-open`))) {
    await page.click(`${block} .opblock-summary-control`);
    await page.waitForSelector(`${block}.is-open`);
  }
  await page.waitForSelector(`${block} .try-out__btn`);
  const tryOut = await page.$(`${block} .try-out__btn:not(.cancel)`);
  if (tryOut) await tryOut.click();
  await page.waitForSelector(`${block} .execute`);
  if (id !== undefined)
    await setReactValue(page, `${block} .parameters input`, id);
  if (body !== undefined)
    await setReactValue(
      page,
      `${block} textarea.body-param__text`,
      JSON.stringify(body, null, 2),
    );

  const previous = await page.$eval(
    block,
    (el) => el.querySelector('.live-responses-table')?.textContent ?? '',
  );
  await page.click(`${block} .execute`);
  await page.waitForFunction(
    (selector, before) => {
      const table = document.querySelector(`${selector} .live-responses-table`);
      return (
        table &&
        table.textContent !== before &&
        !document.querySelector(`${selector} .loading-container`)
      );
    },
    {},
    block,
    previous,
  );
  const [path, status] = expect;
  const actual = await page.$eval(block, (el) => ({
    url: el.querySelector('.request-url pre')?.textContent.trim(),
    status: el
      .querySelector('.live-responses-table tr.response .response-col_status')
      ?.textContent.trim(),
  }));
  if (!actual.url?.endsWith(path) || actual.status !== String(status)) {
    throw new Error(
      `${file}: expected ${path} ${status}, got ${actual.url} ${actual.status}`,
    );
  }
  await (await page.$(block)).screenshot({ path: `${OUT}${file}` });
}

async function setReactValue(page, selector, value) {
  await page.waitForSelector(selector);
  await page.$eval(
    selector,
    (el, text) => {
      const prototype =
        el instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(el, text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
    value,
  );
  // Swagger UI debounces parameter inputs; Execute must not run before the
  // new value reaches its state.
  await sleep(700);
}

async function grafanaExplore(page, range, file) {
  const panes = {
    lab: {
      datasource: 'loki',
      queries: [
        {
          refId: 'A',
          expr: LOGS,
          queryType: 'range',
          editorMode: 'code',
          datasource: { type: 'loki', uid: 'loki' },
        },
      ],
      range: { from: String(range.from), to: String(range.to) },
    },
  };
  const params = new URLSearchParams({
    schemaVersion: '1',
    panes: JSON.stringify(panes),
    orgId: '1',
    theme: 'light',
  });
  await page.setViewport({ width: 1400, height: 1300, deviceScaleFactor: 1.5 });
  await page.goto(`${GRAFANA}/explore?${params}`, {
    waitUntil: 'networkidle0',
  });
  await page.waitForFunction(
    () => document.body.innerText.includes('GET /api/users'),
    { timeout: 30_000 },
  );
  await page.screenshot({ path: `${OUT}${file}` });
}

async function grafanaDashboard(page, range, file) {
  const params = new URLSearchParams({
    orgId: '1',
    from: String(range.from),
    to: String(range.to),
    theme: 'light',
  });
  await page.setViewport({ width: 1400, height: 1000, deviceScaleFactor: 1.5 });
  await page.goto(`${GRAFANA}/d/magister-swp/?${params}&kiosk`, {
    waitUntil: 'networkidle0',
  });
  await page.waitForFunction(
    () => document.body.innerText.includes('/api/users'),
    { timeout: 30_000 },
  );
  await sleep(1500);
  await page.screenshot({ path: `${OUT}${file}` });
}
