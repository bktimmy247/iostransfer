import express from 'express';
import multer from 'multer';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PORT = Number(process.env.PORT || 8799);
const HOST = '0.0.0.0';

export function getLanAddresses() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const entries of Object.values(nets)) {
    for (const item of entries || []) {
      if (item.family === 'IPv4' && !item.internal) ips.push(item.address);
    }
  }
  return ips.sort((a, b) => scoreLanIp(b) - scoreLanIp(a));
}
function scoreLanIp(ip) {
  if (ip.startsWith('192.168.') && !ip.startsWith('192.168.56.')) return 100;
  if (ip.startsWith('10.')) return 80;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return 40;
  if (ip.startsWith('192.168.56.')) return 10;
  return 1;
}
function safeName(name = 'video') {
  const ext = path.extname(name).slice(0, 12) || '.mp4';
  const base = path.basename(name, path.extname(name))
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80) || 'video';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${stamp}-${base}${ext}`;
}

export async function createApp({ port = DEFAULT_PORT, rootDir = moduleDir, uploadDir = path.join(rootDir, 'uploads') } = {}) {
  await fsp.mkdir(uploadDir, { recursive: true });
  const publicDir = path.join(rootDir, 'public');
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => cb(null, safeName(file.originalname)),
  });
  const upload = multer({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      // Same-Wi-Fi trusted transfer tool: accept arbitrary file types.
      // Multer still writes sanitized filenames via safeName().
      cb(null, true);
    },
  });
  const app = express();
  app.use(express.static(publicDir));
  app.use('/uploads', express.static(uploadDir));
  app.get('/api/info', async (_req, res) => {
    const ips = getLanAddresses();
    const hostIp = ips[0] || '127.0.0.1';
    const url = `http://${hostIp}:${port}`;
    res.json({ ok: true, port, lanUrls: ips.map(ip => `http://${ip}:${port}`), primaryUrl: url, uploadDir });
  });
  app.get('/api/qr.svg', async (req, res) => {
    const ip = req.query.ip || getLanAddresses()[0] || '127.0.0.1';
    const url = `http://${ip}:${port}`;
    const svg = await QRCode.toString(url, { type: 'svg', margin: 1, width: 280 });
    res.type('image/svg+xml').send(svg);
  });
  app.get('/api/files', async (_req, res) => {
    const files = (await fsp.readdir(uploadDir, { withFileTypes: true }))
      .filter(d => d.isFile() && d.name !== '.gitkeep')
      .map(d => {
        const full = path.join(uploadDir, d.name);
        const st = fs.statSync(full);
        return { name: d.name, size: st.size, createdAt: st.birthtime, url: `/uploads/${encodeURIComponent(d.name)}` };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ ok: true, files });
  });
  app.post('/api/upload', (req, _res, next) => {
    console.log(`[upload] incoming from ${req.ip} at ${new Date().toISOString()}`);
    next();
  }, upload.array('files', 100), (req, res) => {
    const files = (req.files || []).map(f => ({ name: f.filename, originalName: f.originalname, size: f.size, url: `/uploads/${encodeURIComponent(f.filename)}` }));
    console.log(`[upload] saved ${files.length} file(s): ${files.map(f => `${f.name} (${f.size} bytes)`).join(', ')}`);
    res.json({ ok: true, files });
  });
  app.use((err, _req, res, _next) => {
    console.error(err.message);
    res.status(400).json({ ok: false, error: err.message || 'Upload lỗi' });
  });
  return { app, uploadDir, port };
}

export async function startServer(options = {}) {
  const { app, uploadDir, port = DEFAULT_PORT } = await createApp(options);
  return new Promise((resolve, reject) => {
    const server = app.listen(port, HOST, () => {
      const ips = getLanAddresses();
      const info = {
        server,
        port,
        localUrl: `http://127.0.0.1:${port}`,
        lanUrls: ips.map(ip => `http://${ip}:${port}`),
        uploadDir,
      };
      console.log('iPhone Video Transfer is running');
      console.log(`Local: ${info.localUrl}`);
      for (const url of info.lanUrls) console.log(`LAN:   ${url}`);
      console.log(`Save folder: ${uploadDir}`);
      resolve(info);
    });
    server.on('error', reject);
  });
}

if (process.argv[1] && path.basename(process.argv[1]).toLowerCase() === 'server.js') {
  startServer().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
