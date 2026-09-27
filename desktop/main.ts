// SPDX-License-Identifier: Apache-2.0
// Serve local desktop assets and expose only validated project commands.
import { app, BrowserWindow, protocol, net, ipcMain, dialog, session, Menu } from 'electron';
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join, resolve, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Controller } from './controller.js';
import { command } from '../shared/validate.js';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
protocol.registerSchemesAsPrivileged([{ scheme: 'prism', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
if (process.env.PRISM_STATE_DIR) app.setPath('userData', resolve(process.env.PRISM_STATE_DIR));
let controller: Controller | undefined, closing = false;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { const win = BrowserWindow.getAllWindows()[0]; if (win) { win.restore(); win.focus(); } });
  app.whenReady().then(async () => {
    const statePath = app.getPath('userData'), scratch = join(statePath, 'Workspace');
    mkdirSync(scratch, { recursive: true, mode: 0o700 });
    protocol.handle('prism', request => {
      const url = new URL(request.url);
      let pathname: string;
      try { pathname = decodeURIComponent(url.pathname); } catch { return new Response('', { status: 400 }); }
      if (url.hostname !== 'app' || url.search || url.hash || pathname.includes('..') || pathname.includes('\\'))
        return new Response('', { status: 403 });
      const file = join(root, 'dist', pathname === '/' ? 'index.html' : pathname);
      if (!['.html', '.js', '.css', '.svg', '.png', '.woff2', '.ttf'].includes(extname(file))) return new Response('', { status: 403 });
      return net.fetch(pathToFileURL(file).href);
    });
    session.defaultSession.setPermissionRequestHandler((_web, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    Menu.setApplicationMenu(null);
    const win = new BrowserWindow({ width: 1440, height: 960, minWidth: 860, minHeight: 620,
      title: 'AOTX-PRISM', backgroundColor: '#e9e9e8', show: false,
      webPreferences: { preload: join(dirname(fileURLToPath(import.meta.url)), 'preload.cjs'),
        contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, spellcheck: false } });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', event => event.preventDefault());
    win.webContents.on('will-attach-webview', event => event.preventDefault());
    const preferences = join(statePath, 'workspace.json');
    controller = new Controller(scratch, state => {
      if (!win.isDestroyed()) win.webContents.send('prism:state', state);
    }, undefined, (layout, theme) => {
      writeFileSync(`${preferences}.tmp`, JSON.stringify({ layout, theme }), { mode: 0o600 });
      renameSync(`${preferences}.tmp`, preferences);
    });
    controller.state.version = app.getVersion();
    try {
      const raw = readFileSync(preferences, 'utf8');
      if (raw.length > 263000) throw Error('Invalid workspace preferences.');
      const saved = JSON.parse(raw);
      if (saved.theme === 'silver' || saved.theme === 'graphite') controller.state.theme = saved.theme;
      if (typeof saved.layout === 'string' && saved.layout.length <= 262144) controller.state.layout = saved.layout;
    } catch { /* Use the default layout when preferences cannot be read. */ }
    ipcMain.handle('prism:command', async (event, raw: unknown) => {
      if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame ||
          event.senderFrame.url !== 'prism://app/') throw Error('Invalid command origin.');
      const cmd = command(raw);
      if (cmd.type === 'chooseFolder') {
        const result = await dialog.showOpenDialog(win, { title: 'Open project folder', properties: ['openDirectory', 'createDirectory'] });
        return { state: controller!.state, folder: result.canceled ? undefined : result.filePaths[0] };
      }
      try { return await controller!.run(cmd); }
      catch (error) { throw Error(error instanceof Error ? error.message : 'The command failed.'); }
    });
    await win.loadURL('prism://app/'); win.show();
  }).catch(error => { console.error('Desktop start failed:', error.message); app.quit(); });
}
app.on('window-all-closed', () => app.quit());
app.on('before-quit', event => {
  if (!controller || closing) return;
  event.preventDefault(); closing = true;
  controller.close().finally(() => app.quit());
});
