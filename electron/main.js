import { app, BrowserWindow, shell, dialog } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
let serverInfo;
let mainWindow;

async function createWindow() {
  const uploadDir = path.join(app.getPath('downloads'), 'iPhone File Transfer');
  serverInfo = await startServer({ rootDir, uploadDir, port: 8799 });
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 860,
    minWidth: 920,
    minHeight: 680,
    title: 'iPhone Video Transfer',
    backgroundColor: '#07111f',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  mainWindow.removeMenu();
  await mainWindow.loadURL(serverInfo.localUrl);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(createWindow).catch((err) => {
  dialog.showErrorBox('Không mở được iPhone Video Transfer', err?.message || String(err));
  app.quit();
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {
  try { serverInfo?.server?.close?.(); } catch {}
});
