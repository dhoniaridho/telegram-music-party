const { copyFileSync, existsSync, mkdirSync } = require('node:fs');
const { dirname, resolve } = require('node:path');

const source = resolve(__dirname, '../public/extension.zip');
const destination = resolve(__dirname, '../dist/public/extension.zip');

if (existsSync(source)) {
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(source, destination);
}
