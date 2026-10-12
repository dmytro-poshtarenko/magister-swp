// Empties the users table, runs the API as a separate process, drives
// Swagger UI and Adminer in headless Chrome and saves the screenshots into
// docs/screenshots/lab-02/. The server is restarted before the last Swagger
// request, so that screenshot shows data read back from PostgreSQL.
// Every Swagger request is checked against the expected URL and status code,
// so a screenshot never shows something other than what its file name says.
// Usage: npm run db:up && npm run screenshots
// (CHROME_PATH overrides the Chrome binary, ADMINER_PORT the Adminer port)

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { createMigrator } from '../src/db/migrator.js';
import { createSequelize } from '../src/db/sequelize.js';

const CHROME =
  process.env.CHROME_PATH ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = fileURLToPath(
  new URL('../docs/screenshots/lab-02/', import.meta.url),
);
const API = `http://localhost:${Number(process.env.PORT) || 3000}`;
const ADMINER = `http://localhost:${Number(process.env.ADMINER_PORT) || 8081}`;

const sequelize = createSequelize();
await createMigrator(sequelize).up();
await sequelize.query('TRUNCATE users RESTART IDENTITY');
await sequelize.close();

let server = await startServer();
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
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'uk-UA,uk;q=0.9' });

  await openSwagger(page);
  await execute(page, 'createUser', {
    expect: ['/api/users', 201],
    file: '03-post-create-user.png',
  });
  for (const user of [
    { name: 'Іван Петренко', email: 'ivan@example.com', age: 31 },
    { name: 'Марія Бондар', email: 'maria@example.com', age: 27 },
  ]) {
    await fetch(`${API}/api/users`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(user),
    });
  }
  await execute(page, 'updateUser', {
    id: '1',
    expect: ['/api/users/1', 200],
    file: '04-patch-user.png',
  });
  await execute(page, 'deleteUser', {
    id: '2',
    expect: ['/api/users/2', 204],
    file: '05-delete-user.png',
  });
  await execute(page, 'createUser', {
    body: { name: 'Олена Шевчук', email: 'OLENA@example.com' },
    expect: ['/api/users', 409],
    file: '06-post-duplicate-email-409.png',
  });

  await stopServer(server);
  server = await startServer();
  await openSwagger(page);
  await execute(page, 'listUsers', {
    expect: ['/api/users', 200],
    file: '07-get-users-after-restart.png',
  });

  await adminerLogin(page);
  await adminerShot(page, '&ns=public', '01-adminer-tables.png');
  await adminerShot(
    page,
    '&ns=public&table=users',
    '02-adminer-users-structure.png',
  );
  await adminerShot(
    page,
    '&ns=public&select=users&order%5B0%5D=id',
    '08-adminer-users-data.png',
  );
  console.log(`Скриншоти збережено в ${OUT}`);
} finally {
  await browser.close();
  await stopServer(server);
}

async function startServer() {
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  let output = '';
  await new Promise((resolve, reject) => {
    child.stdout.on('data', (chunk) => {
      output += chunk;
      if (output.includes('Сервер запущено')) resolve();
    });
    child.once('exit', () =>
      reject(new Error(`Сервер не запустився:\n${output}`)),
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

async function execute(page, operationId, { id, body, expect, file }) {
  const block = `#operations-users-${operationId}`;
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
  await new Promise((resolve) => setTimeout(resolve, 700));
}

function adminerUrl(query = '') {
  const params = new URLSearchParams({
    pgsql: 'db',
    username: process.env.DB_USER,
    db: process.env.DB_NAME,
  });
  return `${ADMINER}/?${params}${query}`;
}

async function adminerLogin(page) {
  await page.goto(adminerUrl(), { waitUntil: 'networkidle0' });
  await page.select('select[name="auth[driver]"]', 'pgsql');
  await page.type('input[name="auth[password]"]', process.env.DB_PASSWORD);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    page.click('input[type="submit"]'),
  ]);
  if (await page.$('input[name="auth[password]"]')) {
    throw new Error('Adminer: не вдалося увійти, перевірте DB_* у .env');
  }
}

async function adminerShot(page, query, file) {
  await page.goto(adminerUrl(query), { waitUntil: 'networkidle0' });
  await (await page.$('#content')).screenshot({ path: `${OUT}${file}` });
}
