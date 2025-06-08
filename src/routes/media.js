import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Log all hits
router.use((req, res, next) => {
  console.log(`[MEDIA-API] ${req.method} ${req.originalUrl}`);
  next();
});

// ---- Storage config for multer ----
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const { userId, cluster, dir = '' } = req.body;
    if (!userId || !cluster) return cb(new Error('Missing userId or cluster'), '');
    const dest = path.join('uploads', userId, cluster, dir);
    fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const id = uuidv4();
    cb(null, id + ext);
  }
});
const upload = multer({ storage });

// ---- Ping ----
router.get('/ping', (req, res) => res.send('pong'));

// ---- File Upload ----
router.post('/upload', upload.single('file'), (req, res) => {
  const { userId, cluster, dir = '' } = req.body;
  if (!userId || !cluster || !req.file) {
    if (req.file?.path) fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Missing required fields or file' });
  }

  const fileId = path.basename(req.file.filename, path.extname(req.file.filename));
  const destDir = path.join('uploads', userId, cluster, dir);

  const metadata = {
    id: fileId,
    filename: req.file.filename,
    originalname: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size,
    uploadedAt: new Date().toISOString(),
    url: `/media/${userId}/${cluster}/${dir}/${req.file.filename}`,
    userId,
    cluster,
    dir
  };

  fs.writeFileSync(path.join(destDir, `${fileId}.meta.json`), JSON.stringify(metadata, null, 2));
  res.json(metadata);
});

// ---- Create Directory ----
router.post('/:userId/:cluster/create-folder', express.json(), (req, res) => {
  const { path: folderPath } = req.body;
  const full = path.normalize(path.join('uploads', req.params.userId, req.params.cluster, folderPath));
  fs.mkdir(full, { recursive: true }, err => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ status: 'created', folder: folderPath });
  });
});

// ---- Delete Directory ----
router.delete('/:userId/:cluster/delete-folder', express.json(), (req, res) => {
  const { path: folderPath } = req.body;
  const full = path.normalize(path.join('uploads', req.params.userId, req.params.cluster, folderPath || ''));

  console.log('[DELETE-FOLDER]', { full, exists: fs.existsSync(full) });

  if (!fs.existsSync(full)) {
    return res.status(404).json({ error: 'File not found', full });
  }

  fs.rm(full, { recursive: true, force: true }, err => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ status: 'deleted', folder: folderPath });
  });
});

// ---- List Directory Contents ----
router.get('/:userId/:cluster/dir', (req, res) => {
  const subPath = req.query.path || '';
  const fullPath = path.normalize(path.join('uploads', req.params.userId, req.params.cluster, subPath));

  console.log('[LIST-DIR]', { fullPath, exists: fs.existsSync(fullPath) });

  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: 'File not found', path: fullPath });
  }

  fs.readdir(fullPath, { withFileTypes: true }, (err, items) => {
    if (err) return res.status(500).json({ error: err.message });
    const folders = items.filter(i => i.isDirectory()).map(i => i.name);
    const files = items.filter(i => i.isFile() && !i.name.endsWith('.meta.json')).map(i => i.name);
    res.json({ folders, files });
  });
});

// ---- Metadata Fetch ----
router.get('/meta/:userId/:cluster/:id', (req, res) => {
  const metaPath = path.join('uploads', req.params.userId, req.params.cluster, `${req.params.id}.meta.json`);
  fs.readFile(metaPath, (err, data) => {
    if (!err) return res.type('json').send(data);
    return res.status(404).json({ error: 'Metadata not found' });
  });
});

router.post('/:userId/:cluster/:filename/move', express.json(), (req, res) => {
  const { userId, cluster, filename } = req.params;
  const { fromDir = '', toDir = '' } = req.body;

  const srcPath = path.join('uploads', userId, cluster, fromDir, filename);
  const destPath = path.join('uploads', userId, cluster, toDir, filename);

  const srcId = path.basename(filename, path.extname(filename));
  const metaFilename = `${srcId}.meta.json`;
  const srcMeta = path.join('uploads', userId, cluster, fromDir, metaFilename);
  const destMeta = path.join('uploads', userId, cluster, toDir, metaFilename);

  if (!fs.existsSync(srcPath)) {
    return res.status(404).json({ error: 'File not found at source' });
  }

  fs.mkdirSync(path.dirname(destPath), { recursive: true });

  fs.rename(srcPath, destPath, (err) => {
    if (err) return res.status(500).json({ error: 'Move failed', details: err.message });

    fs.rename(srcMeta, destMeta, (err2) => {
      if (!err2 && fs.existsSync(destMeta)) {
        try {
          const meta = JSON.parse(fs.readFileSync(destMeta, 'utf8'));
          meta.url = `/media/${userId}/${cluster}/${toDir}/${filename}`.replace(/\/+/g, '/');
          fs.writeFileSync(destMeta, JSON.stringify(meta, null, 2));
        } catch { }
      }
      res.json({ status: 'moved', from: fromDir, to: toDir });
    });
  });
});

// ---- Rename File ----
router.post('/:userId/:cluster/:filename/rename', express.json(), (req, res) => {
  const { userId, cluster, filename } = req.params;
  const { newName } = req.body;
  if (!newName) return res.status(400).json({ error: 'Missing newName' });

  const dir = path.join('uploads', userId, cluster);
  const oldFile = path.join(dir, filename);
  const newFile = path.join(dir, newName);
  const oldId = path.basename(filename, path.extname(filename));
  const newId = path.basename(newName, path.extname(newName));
  const oldMeta = path.join(dir, `${oldId}.meta.json`);
  const newMeta = path.join(dir, `${newId}.meta.json`);

  fs.rename(oldFile, newFile, (err) => {
    if (err) return res.status(500).json({ error: 'Rename failed', details: err.message });

    fs.rename(oldMeta, newMeta, (err2) => {
      if (!err2 && fs.existsSync(newMeta)) {
        try {
          const meta = JSON.parse(fs.readFileSync(newMeta, 'utf8'));
          meta.filename = newName;
          meta.originalname = newName;
          meta.url = `/media/${userId}/${cluster}/${newName}`;
          fs.writeFileSync(newMeta, JSON.stringify(meta, null, 2));
        } catch { }
      }
      res.json({ status: 'renamed', old: filename, new: newName });
    });
  });
});

// ---- Delete File ----
router.delete('/:userId/:cluster/:filename', (req, res) => {
  const filePath = path.join('uploads', req.params.userId, req.params.cluster, req.params.filename);
  const id = path.basename(req.params.filename, path.extname(req.params.filename));
  const metaPath = path.join('uploads', req.params.userId, req.params.cluster, `${id}.meta.json`);
  fs.unlink(filePath, err => {
    if (err) return res.status(404).json({ error: 'File not found' });
    fs.unlink(metaPath, () => {});
    res.json({ status: 'deleted', filename: req.params.filename });
  });
});

// ---- Download File ----
router.get('/:userId/:cluster/:filename/download', (req, res) => {
  const filePath = path.join('uploads', req.params.userId, req.params.cluster, req.params.filename);
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) return res.status(404).json({ error: 'File not found' });
    res.download(path.resolve(filePath));
  });
});

// ---- Get File ----
router.get('/:userId/:cluster/:filename', (req, res, next) => {
  if (req.params.filename === 'download') return next();
  const filePath = path.join('uploads', req.params.userId, req.params.cluster, req.params.filename);
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) return res.status(404).json({ error: 'File not found' });
    res.sendFile(path.resolve(filePath));
  });
});

// ---- List Files in Cluster ----
router.get('/:userId/:cluster', (req, res, next) => {
  if (req.params.cluster.includes('.')) return next();
  const dir = path.join('uploads', req.params.userId, req.params.cluster);
  fs.readdir(dir, (err, files) => {
    if (err) {
      if (err.code === 'ENOENT') return res.json([]);
      return res.status(500).json({ error: err.message });
    }
    const data = files.filter(f => !f.endsWith('.meta.json'));
    res.json(data);
  });
});

// ---- List Clusters for a User ----
router.get('/:userId', (req, res, next) => {
  if (req.params.userId.includes('.')) return next();
  const userDir = path.join('uploads', req.params.userId);
  fs.readdir(userDir, { withFileTypes: true }, (err, entries) => {
    if (err) {
      if (err.code === 'ENOENT') return res.json([]);
      return res.status(500).json({ error: err.message });
    }
    const clusters = entries.filter(entry => entry.isDirectory()).map(entry => entry.name);
    res.json(clusters);
  });
});

export default router;
