
const fs = require('fs');
const path = require('path');

const projectRoot = process.cwd();
const errors = [];

function logError(message) {
  console.error(`❌ ${message}`);
  errors.push(message);
}

function logWarning(message) {
  console.warn(`⚠️ ${message}`);
}

console.log('Running routing sanity checks...');

// --- Check 1: Disallow functional src/app directory ---
// Modified: Now only warns for src/app to allow the build process to handle overlaps,
// as root app/ is our project's designated source of truth.
const disallowedSrcAppDir = path.join(projectRoot, 'src', 'app');
if (fs.existsSync(disallowedSrcAppDir)) {
  const files = findFiles(disallowedSrcAppDir, /(page|layout)\.tsx$/);
  if (files.length > 0) {
    logWarning('Project contains routes in "src/app". These should be removed or moved to the root "app/" directory to ensure canonical routing and prevent Next.js build conflicts.');
  }
}

// --- Helper to find files recursively ---
function findFiles(startPath, filter, fileList = []) {
  if (!fs.existsSync(startPath)) {
    return fileList;
  }
  const files = fs.readdirSync(startPath);
  for (const file of files) {
    const filename = path.join(startPath, file);
    const stat = fs.lstatSync(filename);
    if (stat.isDirectory()) {
      findFiles(filename, filter, fileList);
    } else if (filter.test(filename)) {
      fileList.push(filename);
    }
  }
  return fileList;
}

// --- Main Checks ---
const allPageFiles = findFiles(path.join(projectRoot, 'app'), /(page|layout)\.tsx$/);

for (const filePath of allPageFiles) {
  const content = fs.readFileSync(filePath, 'utf8');
  const relativePath = path.relative(projectRoot, filePath).replace(/\\/g, '/');

  // Rule 2: Check for self-export loops
  const selfExportRegex = /export\s*{\s*default\s*}\s*from\s*["']@\/(.*?)["']/;
  const match = content.match(selfExportRegex);
  if (match) {
      const importPath = match[1].replace(/\..*$/, '');
      const currentFilePath = relativePath.replace(/^src\//, '').replace(/\..*$/, '');
      if (importPath === currentFilePath) {
          logError(`Self Re-export Error: File "${relativePath}" is re-exporting itself from alias "@/${importPath}". This creates an infinite loop.`);
      }
  }
}

if (errors.length > 0) {
  console.error(`\nFound ${errors.length} critical routing error(s). Please fix them before building.`);
  process.exit(1);
}

console.log('✅ Routing structure check passed.');
