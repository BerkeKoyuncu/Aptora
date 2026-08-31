const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const version = fs.readFileSync(path.join(root, 'version.txt'), 'utf8').trim();

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error(`Invalid Aptora version: ${version}`);
}

const manifests = [
  'package.json',
  'package-lock.json',
  'client/package.json',
  'client/package-lock.json',
  'server/package.json',
  'server/package-lock.json'
];

for (const relativePath of manifests) {
  const filePath = path.join(root, relativePath);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  data.version = version;
  if (data.packages?.['']) data.packages[''].version = version;
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

console.log(`Aptora manifests synchronized to version ${version}.`);
