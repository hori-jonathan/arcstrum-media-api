import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid'; // npm i uuid

const router = express.Router();

router.get('/ping', (req, res) => res.send('pong'));

// ---- STORAGE ----
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const { userId, cluster } = req.body;
    if (!userId || !cluster) return cb(new Error('Missing userId or cluster'), '');
    const dest = path.join('uploads', userId, cluster);
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

router.get('/meta/:userId/:cluster/:id', (req, res) => {
  const metaPath = path.join('uploads', req.params.userId, req.params.cluster, `${req.params.id}.meta.json`);
  fs.readFile(metaPath, (err, data) => {
    if (!err) return res.type('json').send(data);
    // fallback: minimal metadata
    return res.status(404).json({ error: 'Metadata not found' });
  });
});

router.get('/:userId', (req, res, next) => {
  // If this looks like a file/cluster route, skip (Express will match the more specific route if provided)
  if (req.params.userId.includes('.')) return next();
  const userDir = path.join('uploads', req.params.userId);
  fs.readdir(userDir, { withFileTypes: true }, (err, entries) => {
    if (err) {
      if (err.code === "ENOENT") return res.json([]);
      return res.status(500).json({ error: err.message });
    }
    const clusters = entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);
    res.json(clusters);
  });
});

// ---- CREATE CLUSTER ----
router.post('/:userId/:cluster', (req, res) => {
  const dir = path.join('uploads', req.params.userId, req.params.cluster);
  fs.mkdir(dir, { recursive: true }, err => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ status: 'created', cluster: req.params.cluster });
  });
});

// ---- UPLOAD FILE ----
router.post('/upload', upload.single('file'), (req, res) => {
  const userId = req.body.userId;
  const cluster = req.body.cluster;
  if (!userId || !cluster) {
    if (req.file && req.file.path) fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Missing userId or cluster' });
  }
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const fileId = path.basename(req.file.filename, path.extname(req.file.filename));
  const destDir = path.join('uploads', userId, cluster);

  // Metadata
  const metadata = {
    id: fileId,
    filename: req.file.filename,
    originalname: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size,
    uploadedAt: new Date().toISOString(),
    url: `/media/${userId}/${cluster}/${req.file.filename}`,
    userId,
    cluster
  };
  fs.writeFileSync(
    path.join(destDir, `${fileId}.meta.json`),
    JSON.stringify(metadata, null, 2)
  );

  res.json(metadata);
});

// ---- LIST FILES IN CLUSTER ----
router.get('/:userId/:cluster', (req, res, next) => {
  if (req.params.cluster.includes('.')) return next(); // In case someone requests a filename, pass
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

// ---- GET FILE ----
router.get('/:userId/:cluster/:filename', (req, res, next) => {
  // Prevent matching /download as a filename
  if (req.params.filename === 'download') return next();
  const filePath = path.join('uploads', req.params.userId, req.params.cluster, req.params.filename);
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) return res.status(404).json({ error: 'File not found' });
    res.sendFile(path.resolve(filePath));
  });
});

// ---- DOWNLOAD FILE ----
router.get('/:userId/:cluster/:filename/download', (req, res) => {
  const filePath = path.join('uploads', req.params.userId, req.params.cluster, req.params.filename);
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) return res.status(404).json({ error: 'File not found' });
    res.download(path.resolve(filePath));
  });
});

// ---- DELETE FILE ----
router.delete('/:userId/:cluster/:filename', (req, res) => {
  const filePath = path.join('uploads', req.params.userId, req.params.cluster, req.params.filename);
  const id = path.basename(req.params.filename, path.extname(req.params.filename));
  const metaPath = path.join('uploads', req.params.userId, req.params.cluster, `${id}.meta.json`);
  fs.unlink(filePath, err => {
    if (err) return res.status(404).json({ error: 'File not found' });
    fs.unlink(metaPath, () => {});
    res.json({ status: 'deleted', filename: req.params.filename, userId: req.params.userId, cluster: req.params.cluster });
  });
});

router.post('/:userId/:cluster/:filename/rename', express.json(), (req, res) => {
  const { userId, cluster, filename } = req.params;
  const { newName } = req.body;
  if (!newName) return res.status(400).json({ error: 'Missing newName' });

  const dir = path.join('uploads', userId, cluster);
  const ext = path.extname(filename);
  const oldFile = path.join(dir, filename);
  const newFile = path.join(dir, newName);

  // Rename the file
  fs.rename(oldFile, newFile, (err) => {
    if (err) return res.status(500).json({ error: 'Rename failed', details: err.message });

    // Rename metadata file if present
    const oldId = path.basename(filename, ext);
    const newId = path.basename(newName, path.extname(newName));
    const oldMeta = path.join(dir, `${oldId}.meta.json`);
    const newMeta = path.join(dir, `${newId}.meta.json`);

    fs.rename(oldMeta, newMeta, (err2) => {
      // Update metadata file contents
      if (!err2 && fs.existsSync(newMeta)) {
        try {
          const meta = JSON.parse(fs.readFileSync(newMeta, 'utf8'));
          meta.filename = newName;
          meta.originalname = newName;
          meta.url = `/media/${userId}/${cluster}/${newName}`;
          fs.writeFileSync(newMeta, JSON.stringify(meta, null, 2));
        } catch { /* ignore */ }
      }
      res.json({ status: 'renamed', old: filename, new: newName });
    });
  });
});

export default router;
