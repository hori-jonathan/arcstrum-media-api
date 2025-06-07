import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid'; // npm i uuid

const router = express.Router();

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

// ---- CREATE/UPLOAD ----
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

// ---- GET FILE ----
router.get('/:userId/:cluster/:filename', (req, res) => {
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

// ---- GET METADATA ----
router.get('/meta/:userId/:cluster/:id', (req, res) => {
  const metaPath = path.join('uploads', req.params.userId, req.params.cluster, `${req.params.id}.meta.json`);
  fs.readFile(metaPath, (err, data) => {
    if (!err) return res.type('json').send(data);

    // fallback: minimal metadata
    return res.status(404).json({ error: 'Metadata not found' });
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

// ---- LIST FILES IN CLUSTER ----
router.get('/:userId/:cluster', (req, res) => {
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

// ---- OPTIONAL: CREATE CLUSTER (just creates folder) ----
router.post('/:userId/:cluster', (req, res) => {
  const dir = path.join('uploads', req.params.userId, req.params.cluster);
  fs.mkdir(dir, { recursive: true }, err => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ status: 'created', cluster: req.params.cluster });
  });
});

export default router;
