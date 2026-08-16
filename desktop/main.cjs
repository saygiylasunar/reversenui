const { app, BrowserWindow, WebContentsView, ipcMain, net, safeStorage } = require('electron')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const APP_URL = 'http://127.0.0.1:8765'
const TOOLBAR_HEIGHT = 92
const SIDEBAR_WIDTH = 286

let shellWindow = null
let backendProcess = null
let hibernateTimer = null
const workspaces = new Map()
const toolProcesses = new Map()
let activeIds = ['reversenui']
let layoutMode = 'single'
let memoryProfile = 'balanced'

const defaultTools = JSON.parse(fs.readFileSync(path.join(__dirname, 'default-tools.json'), 'utf8'))

function userFile(name) { return path.join(app.getPath('userData'), name) }
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback }
}
function writeJson(file, value) { fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8') }
function validateSender(event) {
  if (!shellWindow || event.sender.id !== shellWindow.webContents.id) throw new Error('Untrusted IPC sender')
}
function isLocalUrl(value) {
  try {
    const url = new URL(value)
    return ['127.0.0.1', 'localhost', '::1'].includes(url.hostname) && ['http:', 'https:'].includes(url.protocol)
  } catch { return false }
}
function tools() {
  const saved = readJson(userFile('tools.json'), [])
  const byId = new Map(defaultTools.map(tool => [tool.id, tool]))
  for (const tool of saved) byId.set(tool.id, { ...byId.get(tool.id), ...tool })
  return [...byId.values()]
}
function saveTools(next) {
  const clean = next.filter(tool => tool && typeof tool.id === 'string' && typeof tool.name === 'string').map(tool => ({
    id: tool.id.replace(/[^a-zA-Z0-9_-]/g, '-'), name: String(tool.name).slice(0, 80), type: tool.type === 'native' ? 'native' : 'local-web',
    url: String(tool.url || ''), command: String(tool.command || ''), args: Array.isArray(tool.args) ? tool.args.map(String).slice(0, 20) : [], cwd: String(tool.cwd || ''),
    healthUrl: String(tool.healthUrl || ''), stopOnExit: Boolean(tool.stopOnExit), autoStart: Boolean(tool.autoStart)
  }))
  writeJson(userFile('tools.json'), clean)
  return tools()
}

function pythonExecutable() {
  const candidates = process.platform === 'win32'
    ? [path.join(ROOT, 'backend', '.venv', 'Scripts', 'python.exe'), 'python.exe', 'python']
    : [path.join(ROOT, 'backend', '.venv', 'bin', 'python'), 'python3', 'python']
  return candidates.find(candidate => !path.isAbsolute(candidate) || fs.existsSync(candidate)) || candidates.at(-1)
}
function startBackend() {
  if (backendProcess) return
  backendProcess = spawn(pythonExecutable(), ['-m', 'uvicorn', 'app.main:app', '--app-dir', 'backend', '--host', '127.0.0.1', '--port', '8765'], {
    cwd: ROOT, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
  })
  backendProcess.stdout?.on('data', data => console.log(`[core] ${data}`))
  backendProcess.stderr?.on('data', data => console.error(`[core] ${data}`))
  backendProcess.once('exit', () => { backendProcess = null })
}
async function waitForCore(timeoutMs = 20000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try { const response = await net.fetch(`${APP_URL}/api/health`); if (response.ok) return true } catch {}
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  return false
}
function stopChild(child) {
  if (!child || child.killed) return
  if (process.platform === 'win32' && child.pid) spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true })
  else child.kill('SIGTERM')
}

function createWorkspace(meta) {
  const id = meta.id || `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const existing = workspaces.get(id)
  if (existing) return existing
  const item = {
    id, title: meta.title || meta.name || id, url: meta.url, toolId: meta.toolId || null, pinned: Boolean(meta.pinned),
    hibernated: true, view: null, lastActive: Date.now(), partition: `persist:reversenui-${meta.toolId || id}`
  }
  workspaces.set(id, item)
  return item
}
function allowedForWorkspace(item, target) {
  if (item.id === 'reversenui') return target.startsWith(APP_URL)
  return isLocalUrl(target)
}
function materialize(item) {
  if (item.view && !item.view.webContents.isDestroyed()) return item.view
  const view = new WebContentsView({ webPreferences: { partition: item.partition, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true } })
  view.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  view.webContents.on('will-navigate', (event, target) => { if (!allowedForWorkspace(item, target)) event.preventDefault() })
  view.webContents.on('page-title-updated', (_event, title) => { if (title) { item.title = title.slice(0, 100); emitState() } })
  view.webContents.on('render-process-gone', () => { item.hibernated = true; item.view = null; emitState() })
  item.view = view
  item.hibernated = false
  view.webContents.loadURL(item.url)
  return view
}
function detach(item) {
  if (!item.view || item.view.webContents.isDestroyed()) { item.view = null; return }
  try { shellWindow?.contentView.removeChildView(item.view) } catch {}
}
function hibernate(item) {
  if (item.pinned || activeIds.includes(item.id) || !item.view) return
  detach(item)
  try { item.view.webContents.close() } catch {}
  item.view = null
  item.hibernated = true
}
function contentRect() {
  const bounds = shellWindow.getContentBounds()
  return { x: SIDEBAR_WIDTH, y: TOOLBAR_HEIGHT, width: Math.max(1, bounds.width - SIDEBAR_WIDTH), height: Math.max(1, bounds.height - TOOLBAR_HEIGHT) }
}
function tileRects(rect, count, mode) {
  if (count <= 1 || mode === 'single') return [rect]
  if (mode === 'horizontal') {
    const h = Math.floor(rect.height / count)
    return Array.from({ length: count }, (_, i) => ({ x: rect.x, y: rect.y + i * h, width: rect.width, height: i === count - 1 ? rect.height - h * i : h }))
  }
  if (mode === 'grid' && count > 2) {
    const cols = 2, rows = Math.ceil(count / 2), w = Math.floor(rect.width / cols), h = Math.floor(rect.height / rows)
    return Array.from({ length: count }, (_, i) => ({ x: rect.x + (i % 2) * w, y: rect.y + Math.floor(i / 2) * h, width: i % 2 === 1 ? rect.width - w : w, height: Math.floor(i / 2) === rows - 1 ? rect.height - h * (rows - 1) : h }))
  }
  const w = Math.floor(rect.width / count)
  return Array.from({ length: count }, (_, i) => ({ x: rect.x + i * w, y: rect.y, width: i === count - 1 ? rect.width - w * i : w, height: rect.height }))
}
function applyLayout() {
  if (!shellWindow) return
  for (const item of workspaces.values()) detach(item)
  const visible = activeIds.map(id => workspaces.get(id)).filter(Boolean).slice(0, layoutMode === 'grid' ? 4 : 2)
  const rects = tileRects(contentRect(), visible.length, layoutMode)
  visible.forEach((item, index) => {
    item.lastActive = Date.now()
    const view = materialize(item)
    shellWindow.contentView.addChildView(view)
    view.setBounds(rects[index])
  })
  emitState()
}
function setLayout(mode, ids) {
  const validModes = ['single', 'vertical', 'horizontal', 'grid']
  layoutMode = validModes.includes(mode) ? mode : 'single'
  const max = layoutMode === 'grid' ? 4 : layoutMode === 'single' ? 1 : 2
  activeIds = [...new Set(ids)].filter(id => workspaces.has(id)).slice(0, max)
  if (!activeIds.length) activeIds = ['reversenui']
  applyLayout()
}
function closeWorkspace(id) {
  if (id === 'reversenui') return
  const item = workspaces.get(id)
  if (!item) return
  if (item.view) { detach(item); try { item.view.webContents.close() } catch {} }
  workspaces.delete(id)
  activeIds = activeIds.filter(value => value !== id)
  if (!activeIds.length) activeIds = ['reversenui']
  applyLayout()
}
function workspaceState() {
  return { layoutMode, memoryProfile, activeIds, tabs: [...workspaces.values()].map(({ view, ...item }) => ({ ...item, live: Boolean(view && !view.webContents.isDestroyed()) })) }
}
function emitState() { if (shellWindow && !shellWindow.isDestroyed()) shellWindow.webContents.send('workspace:state', workspaceState()) }

function memoryTimeout() { return { never: Infinity, minimum: 30 * 60e3, balanced: 10 * 60e3, maximum: 3 * 60e3 }[memoryProfile] ?? 10 * 60e3 }
function runMemorySaver() {
  const timeout = memoryTimeout(); if (!Number.isFinite(timeout)) return
  const now = Date.now()
  for (const item of workspaces.values()) if (now - item.lastActive > timeout) hibernate(item)
  emitState()
}
function memorySnapshot() {
  const metrics = app.getAppMetrics()
  const totalKb = metrics.reduce((sum, metric) => sum + (metric.memory?.workingSetSize || 0), 0)
  const tabs = [...workspaces.values()].map(item => {
    if (!item.view || item.view.webContents.isDestroyed()) return { id: item.id, memoryKb: 0, sleeping: true }
    const pid = item.view.webContents.getOSProcessId()
    const metric = metrics.find(entry => entry.pid === pid)
    return { id: item.id, memoryKb: metric?.memory?.workingSetSize || 0, sleeping: false }
  })
  return { totalKb, processCount: metrics.length, tabs }
}

function toolById(id) { return tools().find(tool => tool.id === id) }
function startTool(id) {
  const tool = toolById(id); if (!tool) throw new Error('Tool not found')
  if (toolProcesses.has(id)) return { running: true, pid: toolProcesses.get(id).pid }
  if (!tool.command) throw new Error(`Configure a start command for ${tool.name}`)
  const child = spawn(tool.command, tool.args || [], { cwd: tool.cwd || ROOT, shell: process.platform === 'win32', windowsHide: true, stdio: 'ignore' })
  toolProcesses.set(id, child)
  child.once('exit', () => { toolProcesses.delete(id); shellWindow?.webContents.send('tools:status', toolStatuses()) })
  shellWindow?.webContents.send('tools:status', toolStatuses())
  return { running: true, pid: child.pid }
}
function stopTool(id) { const child = toolProcesses.get(id); if (child) { stopChild(child); toolProcesses.delete(id) }; return { running: false } }
function toolStatuses() { return Object.fromEntries(tools().map(tool => [tool.id, { running: toolProcesses.has(tool.id), pid: toolProcesses.get(tool.id)?.pid || null }])) }
function openTool(id) {
  const tool = toolById(id); if (!tool) throw new Error('Tool not found')
  if (tool.type === 'native') { if (!tool.command) throw new Error('Executable is not configured'); startTool(id); return null }
  if (!isLocalUrl(tool.url)) throw new Error('Embedded tools must use a localhost URL')
  const tab = createWorkspace({ id: `tool-${tool.id}`, title: tool.name, url: tool.url, toolId: tool.id })
  setLayout('single', [tab.id])
  return tab.id
}

async function encryptVault(value) {
  const text = JSON.stringify(value)
  if (typeof safeStorage.encryptStringAsync === 'function' && await safeStorage.isAsyncEncryptionAvailable()) return (await safeStorage.encryptStringAsync(text)).toString('base64')
  if (!safeStorage.isEncryptionAvailable()) throw new Error('OS secure storage is not available')
  return safeStorage.encryptString(text).toString('base64')
}
async function decryptVault(encoded) {
  const buffer = Buffer.from(encoded, 'base64')
  if (typeof safeStorage.decryptStringAsync === 'function' && await safeStorage.isAsyncEncryptionAvailable()) return JSON.parse((await safeStorage.decryptStringAsync(buffer)).result)
  if (!safeStorage.isEncryptionAvailable()) throw new Error('OS secure storage is not available')
  return JSON.parse(safeStorage.decryptString(buffer))
}
async function loadVault() {
  try { const saved = readJson(userFile('vault.json'), null); return saved?.payload ? await decryptVault(saved.payload) : [] } catch { return [] }
}
async function saveVault(entries) {
  const clean = Array.isArray(entries) ? entries.slice(0, 200).map(entry => ({ id: String(entry.id || ''), label: String(entry.label || '').slice(0, 100), username: String(entry.username || '').slice(0, 200), secret: String(entry.secret || '').slice(0, 2000), notes: String(entry.notes || '').slice(0, 5000) })) : []
  writeJson(userFile('vault.json'), { version: 1, payload: await encryptVault(clean) })
  return true
}

function registerIpc() {
  ipcMain.handle('workspace:get', event => { validateSender(event); return workspaceState() })
  ipcMain.handle('workspace:layout', (event, payload) => { validateSender(event); setLayout(payload?.mode, payload?.ids || []); return workspaceState() })
  ipcMain.handle('workspace:open-url', (event, payload) => { validateSender(event); if (!isLocalUrl(payload?.url)) throw new Error('Only localhost tools can be embedded'); const item = createWorkspace({ title: payload.title || payload.url, url: payload.url }); setLayout('single', [item.id]); return item.id })
  ipcMain.handle('workspace:close', (event, id) => { validateSender(event); closeWorkspace(id); return workspaceState() })
  ipcMain.handle('memory:profile', (event, profile) => { validateSender(event); memoryProfile = ['never','minimum','balanced','maximum'].includes(profile) ? profile : 'balanced'; runMemorySaver(); return workspaceState() })
  ipcMain.handle('memory:snapshot', event => { validateSender(event); return memorySnapshot() })
  ipcMain.handle('tools:list', event => { validateSender(event); return { tools: tools(), statuses: toolStatuses() } })
  ipcMain.handle('tools:save', (event, next) => { validateSender(event); return { tools: saveTools(next), statuses: toolStatuses() } })
  ipcMain.handle('tools:start', (event, id) => { validateSender(event); return startTool(id) })
  ipcMain.handle('tools:stop', (event, id) => { validateSender(event); return stopTool(id) })
  ipcMain.handle('tools:open', (event, id) => { validateSender(event); return openTool(id) })
  ipcMain.handle('vault:load', event => { validateSender(event); return loadVault() })
  ipcMain.handle('vault:save', (event, entries) => { validateSender(event); return saveVault(entries) })
}

async function createShell() {
  shellWindow = new BrowserWindow({
    width: 1540, height: 960, minWidth: 1000, minHeight: 680, backgroundColor: '#0b0d10', title: 'ReversenUI',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true }
  })
  shellWindow.removeMenu()
  await shellWindow.loadFile(path.join(__dirname, 'shell.html'))
  createWorkspace({ id: 'reversenui', title: 'ReversenUI', url: APP_URL, pinned: true })
  shellWindow.on('resize', applyLayout)
  shellWindow.on('closed', () => {
    for (const item of workspaces.values()) if (item.view) { try { item.view.webContents.close() } catch {} }
    shellWindow = null
  })
  applyLayout()
  for (const tool of tools()) if (tool.autoStart && tool.command) { try { startTool(tool.id) } catch {} }
}

app.whenReady().then(async () => {
  registerIpc()
  startBackend()
  await waitForCore()
  await createShell()
  hibernateTimer = setInterval(runMemorySaver, 60_000)
  setInterval(() => shellWindow?.webContents.send('memory:snapshot', memorySnapshot()), 5_000).unref?.()
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('before-quit', () => {
  if (hibernateTimer) clearInterval(hibernateTimer)
  for (const tool of tools()) if (tool.stopOnExit) stopTool(tool.id)
  stopChild(backendProcess)
})
