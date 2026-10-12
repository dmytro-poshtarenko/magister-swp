import { createApp } from './app.js';

const port = Number(process.env.PORT) || 3000;

createApp().listen(port, () => {
  console.log(`Сервер запущено на http://localhost:${port}`);
  console.log(`Документація API: http://localhost:${port}/docs`);
});
