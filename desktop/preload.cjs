const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('reversenuiDesktop', {
  getWorkspace: () => ipcRenderer.invoke('workspace:get'),
  setLayout: (mode, ids) => ipcRenderer.invoke('workspace:layout', { mode, ids }),
  openLocalUrl: (title, url) => ipcRenderer.invoke('workspace:open-url', { title, url }),
  closeWorkspace: id => ipcRenderer.invoke('workspace:close', id),
  setMemoryProfile: profile => ipcRenderer.invoke('memory:profile', profile),
  getMemorySnapshot: () => ipcRenderer.invoke('memory:snapshot'),
  listTools: () => ipcRenderer.invoke('tools:list'),
  saveTools: tools => ipcRenderer.invoke('tools:save', tools),
  startTool: id => ipcRenderer.invoke('tools:start', id),
  stopTool: id => ipcRenderer.invoke('tools:stop', id),
  openTool: id => ipcRenderer.invoke('tools:open', id),
  loadVault: () => ipcRenderer.invoke('vault:load'),
  saveVault: entries => ipcRenderer.invoke('vault:save', entries),
  onWorkspaceState: callback => ipcRenderer.on('workspace:state', (_event, state) => callback(state)),
  onToolStatus: callback => ipcRenderer.on('tools:status', (_event, status) => callback(status)),
  onMemorySnapshot: callback => ipcRenderer.on('memory:snapshot', (_event, snapshot) => callback(snapshot))
})
