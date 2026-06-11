const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const crypto = require('crypto');

const ROOT = app.isPackaged ? path.dirname(process.execPath) : __dirname;
const SKILLS_DIR = path.join(ROOT, 'skills');

const USER_DATA = app.isPackaged ? app.getPath('userData') : __dirname;
const ROUTINES_DIR = path.join(USER_DATA, 'routines');
const TEST_DIR = path.join(USER_DATA, 'test');
const RESULTS_DIR = path.join(USER_DATA, 'results');
const SCREENSHOTS_DIR = path.join(RESULTS_DIR, 'screenshots');
const TEMP_DIR = path.join(USER_DATA, 'temp');

// Always returns an id whose .json does not yet exist in RESULTS_DIR
function uniqueResultId(name) {
  let id = `${name}-${Date.now()}`;
  while (fs.existsSync(path.join(RESULTS_DIR, `${id}.json`))) {
    id = `${name}-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
  }
  return id;
}

for (const dir of [SKILLS_DIR, ROUTINES_DIR, TEST_DIR, RESULTS_DIR, SCREENSHOTS_DIR, TEMP_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: 'Puppeteer Test Runner',
    backgroundColor: '#0f172a'
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'routines.html'));
  mainWindow.setMenuBarVisibility(false);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// Navigation
ipcMain.on('navigate', (event, page) => {
  mainWindow.loadFile(path.join(__dirname, 'renderer', page));
});

// ── Skills ────────────────────────────────────────────────
ipcMain.handle('skills:list', () => {
  if (!fs.existsSync(SKILLS_DIR)) return [];
  return fs.readdirSync(SKILLS_DIR).filter(f =>
    fs.statSync(path.join(SKILLS_DIR, f)).isDirectory()
  );
});

ipcMain.handle('skills:read', (_, name) => {
  const p = path.join(SKILLS_DIR, name, 'SKILL.md');
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
});

ipcMain.handle('skills:save-dialog', async (_, name) => {
  const content = fs.readFileSync(path.join(SKILLS_DIR, name, 'SKILL.md'), 'utf8');
  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    title: '스킬 저장',
    defaultPath: path.join(app.getPath('home'), '.claude', 'skills', name, 'SKILL.md'),
    filters: [{ name: 'Markdown', extensions: ['md'] }]
  });
  if (!filePath) return { ok: false };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  return { ok: true, filePath };
});

// ── Routines ──────────────────────────────────────────────
ipcMain.handle('routines:list', () => {
  if (!fs.existsSync(ROUTINES_DIR)) return [];
  return fs.readdirSync(ROUTINES_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace(/\.md$/, ''));
});

ipcMain.handle('routines:create', (_, name) => {
  const safeName = name.replace(/[^a-zA-Z0-9가-힣_-]/g, '-');
  const p = path.join(ROUTINES_DIR, `${safeName}.md`);
  if (fs.existsSync(p)) return { ok: false, error: '이미 존재하는 루틴입니다.' };
  fs.writeFileSync(p, `# ${safeName}\n\n테스트 루틴을 여기에 작성하세요.\n`, 'utf8');
  return { ok: true, name: safeName };
});

ipcMain.handle('routines:read', (_, name) => {
  const p = path.join(ROUTINES_DIR, `${name}.md`);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
});

ipcMain.handle('routines:update', (_, name, content) => {
  fs.writeFileSync(path.join(ROUTINES_DIR, `${name}.md`), content, 'utf8');
  return { ok: true };
});

ipcMain.handle('routines:delete', (_, name) => {
  const md = path.join(ROUTINES_DIR, `${name}.md`);
  const js = path.join(TEST_DIR, `${name}.js`);
  if (fs.existsSync(md)) fs.unlinkSync(md);
  if (fs.existsSync(js)) fs.unlinkSync(js);
  return { ok: true };
});

// ── Test Code ─────────────────────────────────────────────
ipcMain.handle('test:read', (_, name) => {
  const p = path.join(TEST_DIR, `${name}.js`);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
});

ipcMain.handle('test:save', (_, name, content) => {
  fs.writeFileSync(path.join(TEST_DIR, `${name}.js`), content, 'utf8');
  return { ok: true };
});

// ── Run: Generate ─────────────────────────────────────────
let generateProc = null;

ipcMain.handle('run:cancel', () => {
  if (generateProc) {
    generateProc.kill();
    generateProc = null;
  }
  return { ok: true };
});

ipcMain.handle('run:generate', async (event, name) => {
  const routinePath = path.join(ROUTINES_DIR, `${name}.md`);
  const testOutputPath = path.join(TEST_DIR, `${name}.js`); // 생성 여부 확인용

  const prompt = `/test_generator\n\n루틴 파일: ${routinePath}\n테스트 코드 저장 경로: ${testOutputPath}`;

  return new Promise((resolve) => {
    generateProc = spawn('claude', ['-p', prompt, '--dangerously-skip-permissions', '--chrome'], {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: ROOT,
      env: { ...process.env }
    });
    const proc = generateProc;

    let output = '';
    let errorOutput = '';

    proc.stdout.on('data', (data) => {
      output += data.toString();
      mainWindow.webContents.send('generate:log', data.toString());
    });

    proc.stderr.on('data', (data) => {
      errorOutput += data.toString();
      mainWindow.webContents.send('generate:log', '[stderr] ' + data.toString());
    });

    proc.on('close', (code, signal) => {
      generateProc = null;
      const cancelled = signal === 'SIGTERM' || signal === 'SIGKILL';
      const hasCode = fs.existsSync(testOutputPath);
      resolve({ ok: !cancelled && (code === 0 || hasCode), cancelled, output, error: errorOutput, hasCode });
    });

    proc.on('error', (err) => {
      generateProc = null;
      resolve({ ok: false, cancelled: false, output, error: err.message, hasCode: false });
    });
  });
});

ipcMain.handle('run:has-code', (_, name) => {
  return fs.existsSync(path.join(TEST_DIR, `${name}.js`));
});

// ── Run: Execute ──────────────────────────────────────────
ipcMain.handle('run:execute', async (event, name) => {
  const testFile = path.join(TEST_DIR, `${name}.js`);
  if (!fs.existsSync(testFile)) {
    const id = uniqueResultId(name);
    const resultPath = path.join(RESULTS_DIR, `${id}.json`);
    const result = {
      id,
      routineName: name,
      executedAt: new Date().toISOString(),
      status: 'fail',
      log: '',
      errors: [{ message: `File not found: ${testFile}`, screenshot: null }]
    };
    fs.writeFileSync(resultPath, JSON.stringify(result, null, 2), 'utf8');
    return { ok: true, id };
  }

  // Generate unique result path here — pass it to the Puppeteer script as argv[2]
  const id = uniqueResultId(name);
  const resultPath = path.join(RESULTS_DIR, `${id}.json`);

  const NODE_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules')
    : path.join(__dirname, 'node_modules');

  return new Promise((resolve) => {
    const proc = spawn('node', [testFile, resultPath], {
      cwd: ROOT,
      env: { ...process.env, NODE_PATH }
    });

    proc.stdout.resume();
    let stderrOutput = '';
    proc.stderr.on('data', (data) => { stderrOutput += data.toString(); });

    proc.on('close', () => {
      if (fs.existsSync(resultPath)) {
        resolve({ ok: true, id });
      } else {
        const result = {
          id,
          routineName: name,
          executedAt: new Date().toISOString(),
          status: 'fail',
          log: '',
          errors: [{ message: stderrOutput.trim() || '결과 JSON이 생성되지 않았습니다.', screenshot: null }]
        };
        fs.writeFileSync(resultPath, JSON.stringify(result, null, 2), 'utf8');
        resolve({ ok: true, id });
      }
    });

    proc.on('error', (err) => {
      const result = {
        id,
        routineName: name,
        executedAt: new Date().toISOString(),
        status: 'fail',
        log: '',
        errors: [{ message: err.message, screenshot: null }]
      };
      fs.writeFileSync(resultPath, JSON.stringify(result, null, 2), 'utf8');
      resolve({ ok: true, id });
    });
  });
});

// ── Results ───────────────────────────────────────────────
ipcMain.handle('results:list', () => {
  if (!fs.existsSync(RESULTS_DIR)) return [];
  return fs.readdirSync(RESULTS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, f), 'utf8'));
        return { id: data.id, routineName: data.routineName, executedAt: data.executedAt, status: data.status };
      } catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.executedAt) - new Date(a.executedAt));
});

ipcMain.handle('results:read', (_, id) => {
  const p = path.join(RESULTS_DIR, `${id}.json`);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
});

ipcMain.handle('results:delete', (_, id) => {
  const jsonPath = path.join(RESULTS_DIR, `${id}.json`);
  if (!fs.existsSync(jsonPath)) return { ok: false };

  try {
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const screenshots = (data.errors || []).map(e => e.screenshot).filter(Boolean);
    for (const rel of screenshots) {
      const abs = path.join(USER_DATA, rel);
      if (fs.existsSync(abs)) fs.unlinkSync(abs);
    }
  } catch {}

  fs.unlinkSync(jsonPath);
  return { ok: true };
});

ipcMain.handle('results:screenshot', (_, rel) => {
  const abs = path.join(USER_DATA, rel);
  return fs.existsSync(abs) ? abs : null;
});

// ── Claude Usage ──────────────────────────────────────────
ipcMain.handle('claude:usage', () => {
  return new Promise((resolve) => {
    const proc = spawn('claude', ['--print'], {
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: ROOT,
      env: { ...process.env }
    });

    proc.stdin.write('/usage\n');
    proc.stdin.end();

    let out = '';
    proc.stdout.on('data', d => out += d.toString());
    proc.stderr.on('data', () => {});

    proc.on('close', () => {
      const sessionMatch = out.match(/Current session:\s*(\d+)%\s*used[^·]*·\s*resets\s*(.+)/);
      const weekMatch = out.match(/Current week[^:]*:\s*(\d+)%\s*used[^·]*·\s*resets\s*(.+)/);
      resolve({
        ok: !!(sessionMatch || weekMatch),
        session: sessionMatch ? { pct: parseInt(sessionMatch[1]), resets: sessionMatch[2].trim() } : null,
        week:    weekMatch    ? { pct: parseInt(weekMatch[1]),    resets: weekMatch[2].trim()    } : null,
        raw: out.trim()
      });
    });

    proc.on('error', () => resolve({ ok: false }));
  });
});
