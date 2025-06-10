import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// === CENTRALIZED UPLOAD DIR ===
const UPLOADS_ROOT = path.join(process.cwd(), '..', 'serverdata', 'media', 'uploads');

router.use((req, res, next) => {
  console.log(`[MEDIA-API] ${req.method} ${req.originalUrl}`);
  next();
});

// ---- Dynamic Multer Upload ----
function createTempUploader() {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const tempDir = path.join(UPLOADS_ROOT, 'tmp');
      fs.mkdirSync(tempDir, { recursive: true });
      cb(null, tempDir);
    },
    filename: (_, file, cb) => {
      const ext = path.extname(file.originalname);
      const id = uuidv4();
      cb(null, id + ext);
    }
  });
  return multer({ storage }).single('file');
}

// ---- Ping ----
router.get('/ping', (_, res) => res.send('pong'));

// ---- File Upload ----
router.post('/:userId/:cluster/upload', (req, res) => {
  const { userId, cluster } = req.params;
  const uploader = createTempUploader();

  uploader(req, res, err => {
    if (err || !req.file) {
      return res.status(400).json({ error: err?.message || "Upload failed" });
    }

    const dir = req.body.directory || "";
    const destDir = path.join(UPLOADS_ROOT, userId, cluster, dir);
    fs.mkdirSync(destDir, { recursive: true });

    // Move file from tmp to final location
    const destPath = path.join(destDir, req.file.filename);
    fs.renameSync(req.file.path, destPath);

    // Metadata
    const fileId = path.basename(req.file.filename, path.extname(req.file.filename));
    const meta = {
      id: fileId,
      filename: req.file.filename,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      uploadedAt: new Date().toISOString(),
      url: `/media/${userId}/${cluster}${dir ? `/${dir}` : ""}/${req.file.filename}`.replace(/\/+/g, '/'),
      userId,
      cluster,
      dir,
    };
    fs.writeFileSync(path.join(destDir, `${fileId}.meta.json`), JSON.stringify(meta, null, 2));
    res.json(meta);
  });
});

// ---- Create Folder ----
router.post('/:userId/:cluster/create-folder', express.json(), (req, res) => {
  const full = path.join(UPLOADS_ROOT, req.params.userId, req.params.cluster, req.body.path || '');
  fs.mkdir(full, { recursive: true }, err => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ status: 'created', folder: req.body.path });
  });
});

// ---- Delete Folder ----
router.delete('/:userId/:cluster/delete-folder', express.json(), (req, res) => {
  const full = path.join(UPLOADS_ROOT, req.params.userId, req.params.cluster, req.body.path || '');
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'File not found', full });
  fs.rm(full, { recursive: true, force: true }, err => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ status: 'deleted', folder: req.body.path });
  });
});

// ---- List Dir ----
router.get('/:userId/:cluster/dir', (req, res) => {
  const dir = req.query.path || '';
  const fullPath = path.join(UPLOADS_ROOT, req.params.userId, req.params.cluster, dir);
  if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File not found', path: fullPath });

  fs.readdir(fullPath, { withFileTypes: true }, (err, items) => {
    if (err) return res.status(500).json({ error: err.message });
    const folders = items.filter(i => i.isDirectory()).map(i => i.name);
    const files = items.filter(i => i.isFile() && !i.name.endsWith('.meta.json')).map(i => i.name);
    res.json({ folders, files });
  });
});

// ---- Metadata ----
router.get('/meta/:userId/:cluster/:id', (req, res) => {
  const dir = req.query.dir || '';
  const metaPath = path.join(UPLOADS_ROOT, req.params.userId, req.params.cluster, dir, `${req.params.id}.meta.json`);
  fs.readFile(metaPath, (err, data) => {
    if (!err) return res.type('json').send(data);
    res.status(404).json({ error: 'Metadata not found' });
  });
});

// ---- Move File ----
router.post('/:userId/:cluster/:filename/move', express.json(), (req, res) => {
  const { userId, cluster, filename } = req.params;
  const { fromDir = '', toDir = '' } = req.body;
  const srcPath = path.join(UPLOADS_ROOT, userId, cluster, fromDir, filename);
  const destPath = path.join(UPLOADS_ROOT, userId, cluster, toDir, filename);

  const id = path.basename(filename, path.extname(filename));
  const srcMeta = path.join(UPLOADS_ROOT, userId, cluster, fromDir, `${id}.meta.json`);
  const destMeta = path.join(UPLOADS_ROOT, userId, cluster, toDir, `${id}.meta.json`);

  if (!fs.existsSync(srcPath)) return res.status(404).json({ error: 'File not found at source' });

  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.renameSync(srcPath, destPath);
  fs.renameSync(srcMeta, destMeta);

  if (fs.existsSync(destMeta)) {
    try {
      const meta = JSON.parse(fs.readFileSync(destMeta, 'utf8'));
      meta.url = `/media/${userId}/${cluster}/${toDir}/${filename}`.replace(/\/+/g, '/');
      fs.writeFileSync(destMeta, JSON.stringify(meta, null, 2));
    } catch {}
  }
  res.json({ status: 'moved', from: fromDir, to: toDir });
});

// ---- Rename File ----
router.post('/:userId/:cluster/:filename/rename', express.json(), (req, res) => {
  const { userId, cluster, filename } = req.params;
  const { newName, dir = '' } = req.body;

  if (!newName) return res.status(400).json({ error: 'Missing newName' });

  const folder = path.join(UPLOADS_ROOT, userId, cluster, dir);
  const oldFile = path.join(folder, filename);
  const newFile = path.join(folder, newName);

  const oldId = path.basename(filename, path.extname(filename));
  const newId = path.basename(newName, path.extname(newName));
  const oldMeta = path.join(folder, `${oldId}.meta.json`);
  const newMeta = path.join(folder, `${newId}.meta.json`);

  if (!fs.existsSync(oldFile)) {
    return res.status(404).json({ error: 'Original file not found', path: oldFile });
  }

  try {
    fs.renameSync(oldFile, newFile);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to rename file', details: err.message });
  }

  try {
    if (fs.existsSync(oldMeta)) {
      fs.renameSync(oldMeta, newMeta);
      if (fs.existsSync(newMeta)) {
        const meta = JSON.parse(fs.readFileSync(newMeta, 'utf8'));
        meta.filename = newName;
        meta.originalname = newName;
        meta.url = `/media/${userId}/${cluster}/${dir}/${newName}`.replace(/\/+/g, '/');
        fs.writeFileSync(newMeta, JSON.stringify(meta, null, 2));
      }
    }
  } catch (err) {
    // Metadata rename should not block the response
    console.warn(`[RENAME META] Warning: ${err.message}`);
  }

  res.json({ status: 'renamed', old: filename, new: newName });
});

// ---- Delete ----
router.delete('/:userId/:cluster/:filename', (req, res) => {
  const dir = req.query.dir || '';
  const filePath = path.join(UPLOADS_ROOT, req.params.userId, req.params.cluster, dir, req.params.filename);
  const id = path.basename(req.params.filename, path.extname(req.params.filename));
  const metaPath = path.join(UPLOADS_ROOT, req.params.userId, req.params.cluster, dir, `${id}.meta.json`);

  fs.unlinkSync(filePath);
  if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
  res.json({ status: 'deleted', filename: req.params.filename });
});

// ---- Download ----
router.get('/:userId/:cluster/:filename/download', (req, res) => {
  const dir = req.query.dir || '';
  const filePath = path.join(UPLOADS_ROOT, req.params.userId, req.params.cluster, dir, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  res.download(path.resolve(filePath));
});

// ---- Get File ----
router.get('/:userId/:cluster/:filename', (req, res, next) => {
  if (req.params.filename === 'download') return next();
  const dir = req.query.dir || '';
  const filePath = path.join(UPLOADS_ROOT, req.params.userId, req.params.cluster, dir, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  res.sendFile(path.resolve(filePath));
});

// ---- Create Cluster ----
router.post('/:userId/:cluster', (req, res) => {
  const { userId, cluster } = req.params;
  const clusterPath = path.join(UPLOADS_ROOT, userId, cluster);
  try {
    fs.mkdirSync(clusterPath, { recursive: true });
    res.json({ status: 'created', cluster });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- List Clusters ----
router.get('/:userId', (req, res, next) => {
  if (req.params.userId.includes('.')) return next();
  const userDir = path.join(UPLOADS_ROOT, req.params.userId);
  fs.readdir(userDir, { withFileTypes: true }, (err, entries) => {
    if (err) {
      if (err.code === 'ENOENT') return res.json([]);
      return res.status(500).json({ error: err.message });
    }
    const clusters = entries.filter(e => e.isDirectory()).map(e => e.name);
    res.json(clusters);
  });
});

export default router;
