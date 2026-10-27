// Lint, format and run related unit tests for the staged files only (ENGINEERING_RULES.md section 4.3).
// npm run executes inside each app folder, so every tool finds its own config. Paths are absolute.
const quote = (files) => files.map((f) => `"${f}"`).join(' ');

export default {
  'backend/**/*.ts': (files) => [
    `npm --prefix backend run lint:files -- ${quote(files)}`,
    `prettier --write ${quote(files)}`,
    `npm --prefix backend run test:related -- ${quote(files)}`,
  ],
  'frontend/**/*.{ts,tsx,js,mjs}': (files) => [
    `npm --prefix frontend run lint:files -- ${quote(files)}`,
    `prettier --write ${quote(files)}`,
  ],
  '*.{json,yml,yaml,css}': (files) => `prettier --write ${quote(files)}`,
};
