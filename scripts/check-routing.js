
const fs = require('fs');
const path = require('path');

const projectRoot = process.cwd();
const errors = [];

function logError(message) {
  console.error(`❌ ${message}`);
  errors.push(message);
}

console.log('Running routing sanity checks...');

// --- Check 1: Disallow src/app directory ---
// Per Next.js App Router conventions, the 'app' directory should be at the root.
// The presence of 'src/app' indicates a potential Pages Router conflict or incorrect structure.
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
const seenPaths = new Set();

for (const filePath of allPageFiles) {
  const content = fs.readFileSync(filePath, 'utf8');
  const relativePath = path.relative(projectRoot, filePath).replace(/\\/g, '/');

  // Check 2: Find duplicate paths by normalizing them
  // This treats 'app/page.tsx' and 'app/app/page.tsx' as the same route, which is incorrect.
  const normalizedPath = relativePath.replace(/^app\/(app\/)?/, 'app/');
  if (seenPaths.has(normalizedPath)) {
    logError(`Duplicate Route Error: The route corresponding to "${normalizedPath}" is defined in multiple locations. Please consolidate into a single file under 'app/app'.`);
  }
  seenPaths.add(normalizedPath);

  // Check 3: Check for self re-export, which causes an infinite loop.
  const selfExportRegex = /export\s*{\s*default\s*}\s*from\s*["']@\/(.*?)["']/;
  const match = content.match(selfExportRegex);
  if (match) {
    const importPath = match[1].replace(/\..*$/, ''); // remove extension from import
    const currentFilePath = relativePath.replace(/^src\//, '').replace(/\..*$/, ''); // remove extension from file path
    
    // Heuristic check: if the resolved import path is the same as the file's own path.
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
