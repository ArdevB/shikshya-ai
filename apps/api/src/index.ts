import { createApp } from './app.js';
import { env } from './config/env.js';

createApp().listen(env.PORT, () => {
  console.log(`Shikshya API listening on http://localhost:${env.PORT}`);
});
