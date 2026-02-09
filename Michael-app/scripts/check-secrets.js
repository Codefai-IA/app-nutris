/**
 * Pre-commit hook to detect exposed secrets
 * Run: node scripts/check-secrets.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Patterns that indicate exposed secrets
const SECRET_PATTERNS = [
  {
    pattern: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9/,
    name: 'Supabase JWT Token',
    severity: 'ERROR'
  },
  {
    pattern: /https:\/\/[a-z]+\.supabase\.co/,
    name: 'Supabase URL',
    severity: 'WARNING'
  }
];

// Files/directories to ignore
const IGNORE_PATTERNS = [
  '.env',
  '.env.local',
  '.env.example',
  'node_modules',
  'dist',
  '.git',
  'check-secrets.js'
];

function shouldIgnore(filePath) {
  return IGNORE_PATTERNS.some(pattern => filePath.includes(pattern));
}

function getStagedFiles() {
  try {
    const output = execSync('git diff --cached --name-only', { encoding: 'utf-8' });
    return output.split('\n').filter(f => f.trim() !== '');
  } catch (e) {
    console.log('Not in a git repository or no staged files');
    return [];
  }
}

function checkFile(filePath) {
  if (shouldIgnore(filePath)) return [];

  const fullPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(fullPath)) return [];

  try {
    const content = fs.readFileSync(fullPath, 'utf-8');
    const findings = [];

    for (const { pattern, name, severity } of SECRET_PATTERNS) {
      if (pattern.test(content)) {
        findings.push({ file: filePath, secret: name, severity });
      }
    }

    return findings;
  } catch (e) {
    return [];
  }
}

function main() {
  console.log('Checking for exposed secrets...\n');

  const stagedFiles = getStagedFiles();
  if (stagedFiles.length === 0) {
    console.log('No staged files to check.');
    process.exit(0);
  }

  let hasErrors = false;
  const allFindings = [];

  for (const file of stagedFiles) {
    const findings = checkFile(file);
    allFindings.push(...findings);

    for (const finding of findings) {
      if (finding.severity === 'ERROR') {
        hasErrors = true;
        console.log(`ERROR: ${finding.secret} found in ${finding.file}`);
      } else {
        console.log(`WARNING: ${finding.secret} found in ${finding.file}`);
      }
    }
  }

  if (allFindings.length === 0) {
    console.log('No secrets detected\n');
  }

  if (hasErrors) {
    console.log('\nCommit blocked! Please remove exposed secrets and use environment variables.');
    process.exit(1);
  }

  process.exit(0);
}

main();
