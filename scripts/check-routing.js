const fs = require('fs');
const path = require('path');

const projectRoot = process.cwd();
const errors = [];

function logError(message) {
  console.error(`❌ ${message}`);
  errors.push(message);
}

console.log('Running routing sanity checks...');

// --- Check 1: Disallow src/app/app directory ---
const disallowedSrcDir = path.join(projectRoot, 'src', 'app', 'app');
if (fs.existsSync(disallowedSrcDir)) {
  logError('Critical Routing Error: The directory "src/app/app" is not allowed. All application routes must exist under the root "app/app/" directory.');
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
  const normalizedPath = relativePath.replace(/^app\/(app\/)?/, 'app/');
  if (seenPaths.has(normalizedPath)) {
    logError(`Duplicate Route Error: The route corresponding to "${normalizedPath}" is defined in multiple locations.`);
  }
  seenPaths.add(normalizedPath);

  // Check 3: Check for self re-export from the same file path structure
  const selfExportRegex = /export\s*{\s*default\s*}\s*from\s*["']@\/(.*?)["']/;
  const match = content.match(selfExportRegex);
  if (match) {
    const importPath = match[1].replace(/\..*$/, ''); // remove extension
    const currentFilePath = relativePath.replace(/^src\//, '').replace(/\..*$/, '');
    
    // This is a heuristic comparison. A true check would need to resolve tsconfig paths.
    if (importPath === currentFilePath) {
        logError(`Self Re-export Error: File "${relativePath}" is re-exporting itself from alias "@/${importPath}".`);
    }
  }
}


if (errors.length > 0) {
  console.error(`\nFound ${errors.length} routing error(s). Please fix them before building.`);
  process.exit(1);
}

console.log('✅ Routing structure check passed.');
