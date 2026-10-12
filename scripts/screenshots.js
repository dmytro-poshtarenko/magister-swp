// Starts the API on a free port, drives Swagger UI in headless Chrome and saves
// one screenshot per executed request into docs/screenshots/.
// Usage: npm run screenshots   (CHROME_PATH overrides the Chrome binary)

import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { createApp } from '../src/app.js';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = fileURLToPath(new URL('../docs/screenshots/', import.meta.url));

const server = await new Promise((resolve) => {
  const instance = createApp().listen(Number(process.env.PORT) || 3000, () => resolve(instance));
});
const base = `http://localhost:${server.address().port}`;
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  defaultViewport: { width: 1100, height: 900, deviceScaleFactor: 1.5 },
});

try {
  await mkdir(OUT, { recursive: true });
  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await page.goto(`${base}/docs`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.opblock');
  await page.screenshot({ path: `${OUT}01-swagger-overview.png`, fullPage: true });

  // The documented response codes make every block very tall; the live response is what matters.
  await page.addStyleTag({
    content: `.responses-table:not(.live-responses-table) { display: none !important; }
      textarea.body-param__text { height: 130px !important; min-height: 0 !important; }`,
  });

  await execute(page, 'createUser', { file: '02-post-create-user.png' });
  await fetch(`${base}/api/users`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Іван Петренко', email: 'ivan@example.com', age: 31 }),
  });
  await execute(page, 'listUsers', { file: '03-get-users.png' });
  await execute(page, 'getUser', { id: '1', file: '04-get-user-by-id.png' });
  await execute(page, 'replaceUser', { id: '1', file: '05-put-user.png' });
  await execute(page, 'updateUser', { id: '1', file: '06-patch-user.png' });
  await execute(page, 'deleteUser', { id: '2', file: '07-delete-user.png' });
  await execute(page, 'getUser', { id: '2', file: '08-get-deleted-user-404.png' });
  await execute(page, 'createUser', {
    body: { name: 'О', email: 'olena-at-example.com', age: 0 },
    file: '09-post-validation-error-400.png',
  });
  await execute(page, 'createUser', {
    body: { name: 'Олена Шевчук', email: 'OLENA.SHEVCHUK@example.com' },
    file: '10-post-duplicate-email-409.png',
  });
  console.log(`Скриншоти збережено в ${OUT}`);
} finally {
  await browser.close();
  server.close();
}

async function execute(page, operationId, { id, body, file }) {
  const block = `#operations-users-${operationId}`;
  if (!(await page.$(`${block}.is-open`))) {
    await page.click(`${block} .opblock-summary-control`);
    await page.waitForSelector(`${block}.is-open`);
  }
  await page.waitForSelector(`${block} .try-out__btn`);
  const tryOut = await page.$(`${block} .try-out__btn:not(.cancel)`);
  if (tryOut) await tryOut.click();
  await page.waitForSelector(`${block} .execute`);
  if (id !== undefined) await setReactValue(page, `${block} .parameters input`, id);
  if (body !== undefined) await setReactValue(page, `${block} textarea.body-param__text`, JSON.stringify(body, null, 2));

  const previous = await page.$eval(block, (el) => el.querySelector('.live-responses-table')?.textContent ?? '');
  await page.click(`${block} .execute`);
  await page.waitForFunction(
    (selector, before) => {
      const table = document.querySelector(`${selector} .live-responses-table`);
      return table && table.textContent !== before && !document.querySelector(`${selector} .loading-container`);
    },
    {},
    block,
    previous,
  );
  await (await page.$(block)).screenshot({ path: `${OUT}${file}` });
}

async function setReactValue(page, selector, value) {
  await page.waitForSelector(selector);
  await page.$eval(
    selector,
    (el, text) => {
      const prototype = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(el, text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
    value,
  );
}
