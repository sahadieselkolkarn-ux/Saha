
const fs = require('fs');
const path = require('path');

const projectRoot = process.cwd();
const errors = [];

// New Policy: Allow legacy routes only for redirect handling.
const ALLOW_LEGACY_APP_SEGMENT = new Set([
  "app/app/[...path]/page.tsx",
  "app/app/page.tsx",
  "app/app/layout.tsx"
]);

function logError(message) {
  console.error(`❌ ${message}`);
  errors.push(message);
}

console.log('Running routing sanity checks...');

// --- Check 1: Disallow src/app directory ---
const disallowedSrcAppDir = path.join(projectRoot, 'src', 'app');
if (fs.existsSync(disallowedSrcAppDir) && fs.readdirSync(disallowedSrcAppDir).length > 0) {
  logError('Critical Routing Error: The directory "src/app" must be empty. All application routes must exist under the root "app/" directory.');
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

  // Rule 1 (New): Disallow files in app/app unless they are part of the legacy redirect handlers.
  if (relativePath.startsWith('app/app/') && !ALLOW_LEGACY_APP_SEGMENT.has(relativePath)) {
    logError(`Legacy Route Error: Route file "${relativePath}" must be moved to the root "app/" directory. The "app/app/" segment is for legacy redirects only.`);
  }

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
