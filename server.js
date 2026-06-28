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
const MAX_UPLOAD_SIZE = 20 * 1024 * 1024 * 1024;

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
function safeName(name = 'file') {
  const ext = path.extname(name).slice(0, 12) || '.bin';
  const base = path.basename(name, path.extname(name))
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80) || 'file';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${stamp}-${base}${ext}`;
}
function safeUploadId(id = '') {
  return String(id).replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 120);
}
async function exists(file) {
  try { await fsp.access(file); return true; } catch { return false; }
}

export async function createApp({ port = DEFAULT_PORT, rootDir = moduleDir, uploadDir = path.join(rootDir, 'uploads') } = {}) {
  await fsp.mkdir(uploadDir, { recursive: true });
  const publicDir = path.join(rootDir, 'public');
  const chunkRoot = path.join(uploadDir, '.chunks');
  await fsp.mkdir(chunkRoot, { recursive: true });

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => cb(null, safeName(file.originalname)),
  });
  const upload = multer({
    storage,
    limits: { fileSize: MAX_UPLOAD_SIZE },
    fileFilter: (_req, _file, cb) => cb(null, true),
  });
  const chunkStorage = multer.diskStorage({
    destination: async (req, _file, cb) => {
      try {
        const uploadId = safeUploadId(req.body.uploadId);
        if (!uploadId) throw new Error('Thiếu uploadId');
        const dir = path.join(chunkRoot, uploadId);
        await fsp.mkdir(dir, { recursive: true });
        cb(null, dir);
      } catch (err) {
        cb(err);
      }
    },
    filename: (req, _file, cb) => {
      const index = Number(req.body.index);
      if (!Number.isInteger(index) || index < 0) return cb(new Error('Chunk index không hợp lệ'));
      cb(null, `${String(index).padStart(8, '0')}.part`);
    },
  });
  const chunkUpload = multer({
    storage: chunkStorage,
    limits: { fileSize: 64 * 1024 * 1024 },
    fileFilter: (_req, _file, cb) => cb(null, true),
  });

  const app = express();
  app.use(express.json({ limit: '2mb' }));
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

  app.post('/api/chunk/init', async (req, res) => {
    const originalName = String(req.body?.name || 'file');
    const size = Number(req.body?.size || 0);
    const totalChunks = Number(req.body?.totalChunks || 0);
    if (!Number.isFinite(size) || size < 0 || size > MAX_UPLOAD_SIZE) return res.status(400).json({ ok: false, error: 'Dung lượng file không hợp lệ' });
    if (!Number.isInteger(totalChunks) || totalChunks <= 0 || totalChunks > 20000) return res.status(400).json({ ok: false, error: 'Số chunk không hợp lệ' });
    const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const finalName = safeName(originalName);
    const dir = path.join(chunkRoot, uploadId);
    await fsp.mkdir(dir, { recursive: true });
    const meta = { uploadId, originalName, finalName, size, totalChunks, createdAt: new Date().toISOString() };
    await fsp.writeFile(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');
    console.log(`[chunk-init] ${uploadId} ${originalName} ${size} bytes ${totalChunks} chunks`);
    res.json({ ok: true, uploadId, finalName });
  });

  app.post('/api/chunk', chunkUpload.single('chunk'), async (req, res) => {
    const uploadId = safeUploadId(req.body.uploadId);
    const index = Number(req.body.index);
    if (!uploadId || !Number.isInteger(index) || index < 0) return res.status(400).json({ ok: false, error: 'Thông tin chunk không hợp lệ' });
    if (!req.file) return res.status(400).json({ ok: false, error: 'Không có chunk được gửi lên' });
    console.log(`[chunk] ${uploadId} #${index} ${req.file.size} bytes`);
    res.json({ ok: true, uploadId, index, size: req.file.size });
  });

  app.post('/api/chunk/complete', async (req, res) => {
    const uploadId = safeUploadId(req.body?.uploadId);
    if (!uploadId) return res.status(400).json({ ok: false, error: 'Thiếu uploadId' });
    const dir = path.join(chunkRoot, uploadId);
    const metaPath = path.join(dir, 'meta.json');
    if (!(await exists(metaPath))) return res.status(404).json({ ok: false, error: 'Không tìm thấy phiên upload' });
    const meta = JSON.parse(await fsp.readFile(metaPath, 'utf8'));
    const finalPath = path.join(uploadDir, meta.finalName);
    const out = fs.createWriteStream(finalPath, { flags: 'w' });
    let assembled = 0;
    try {
      for (let i = 0; i < meta.totalChunks; i++) {
        const chunkPath = path.join(dir, `${String(i).padStart(8, '0')}.part`);
        if (!(await exists(chunkPath))) throw new Error(`Thiếu chunk ${i + 1}/${meta.totalChunks}`);
        const st = await fsp.stat(chunkPath);
        assembled += st.size;
        await new Promise((resolve, reject) => {
          const input = fs.createReadStream(chunkPath);
          input.on('error', reject);
          input.on('end', resolve);
          input.pipe(out, { end: false });
        });
      }
      await new Promise((resolve, reject) => out.end(err => err ? reject(err) : resolve()));
      if (assembled !== meta.size) console.warn(`[chunk-complete] size mismatch ${uploadId}: expected ${meta.size}, got ${assembled}`);
      await fsp.rm(dir, { recursive: true, force: true });
      const file = { name: meta.finalName, originalName: meta.originalName, size: assembled, url: `/uploads/${encodeURIComponent(meta.finalName)}` };
      console.log(`[chunk-complete] saved ${file.name} (${assembled} bytes)`);
      res.json({ ok: true, file });
    } catch (err) {
      out.destroy();
      await fsp.rm(finalPath, { force: true }).catch(() => {});
      throw err;
    }
  });

  app.post('/api/upload-one', (req, _res, next) => {
    console.log(`[upload-one] incoming from ${req.ip} at ${new Date().toISOString()}`);
    next();
  }, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ ok: false, error: 'Không có file được gửi lên' });
    const file = { name: req.file.filename, originalName: req.file.originalname, size: req.file.size, url: `/uploads/${encodeURIComponent(req.file.filename)}` };
    console.log(`[upload-one] saved ${file.name} (${file.size} bytes)`);
    res.json({ ok: true, file });
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
      console.log('iPhone File Transfer is running');
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
