const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Skills
  skillsList: () => ipcRenderer.invoke('skills:list'),
  skillsRead: (name) => ipcRenderer.invoke('skills:read', name),
  skillsSaveDialog: (name) => ipcRenderer.invoke('skills:save-dialog', name),

  // Routines
  routinesList: (params) => ipcRenderer.invoke('routines:list', params),
  routinesCreate: (name) => ipcRenderer.invoke('routines:create', name),
  routinesRead: (name) => ipcRenderer.invoke('routines:read', name),
  routinesUpdate: (name, content) => ipcRenderer.invoke('routines:update', name, content),
  routinesDelete: (name) => ipcRenderer.invoke('routines:delete', name),

  // Test code
  testRead: (name) => ipcRenderer.invoke('test:read', name),
  testSave: (name, content) => ipcRenderer.invoke('test:save', name, content),

  // Run
  runGenerate: (name) => ipcRenderer.invoke('run:generate', name),
  runCancel: () => ipcRenderer.invoke('run:cancel'),
  runExecute: (name, vars) => ipcRenderer.invoke('run:execute', name, vars),
  runHasCode: (name) => ipcRenderer.invoke('run:has-code', name),

  // Results
  resultsList: (params) => ipcRenderer.invoke('results:list', params),
  resultsRead: (id) => ipcRenderer.invoke('results:read', id),
  resultsDelete: (id) => ipcRenderer.invoke('results:delete', id),
  resultsScreenshot: (rel) => ipcRenderer.invoke('results:screenshot', rel),

  // Claude usage
  claudeUsage: () => ipcRenderer.invoke('claude:usage'),

  // Navigation
  navigate: (page) => ipcRenderer.send('navigate', page),

  // Stream events
  onGenerateLog: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('generate:log', handler);
    return () => ipcRenderer.removeListener('generate:log', handler);
  }
});
