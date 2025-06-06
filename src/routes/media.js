import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = express.Router();

// -- Multer config --
const storage = multer.diskStorage({
  // Accepts userId and dbName from form field or query param
  destination: (req, file, cb) => {
    const userId = req.body.userId || req.query.userId;
    const dbName = req.body.dbName || req.query.dbName;
    if (!userId || !dbName) return cb(new Error('Missing userId or dbName'), null);
    const dest = path.join('uploads', userId, dbName);
    fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext);
    const unique = `${base}-${Date.now()}${ext}`;
    cb(null, unique);
  }
});
const upload = multer({ storage });

// === POST /media/upload ===
router.post('/upload', upload.single('file'), (req, res) => {
  const userId = req.body.userId || req.query.userId;
  const dbName = req.body.dbName || req.query.dbName;
  if (!userId || !dbName) return res.status(400).json({ error: 'Missing userId or dbName' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const metadata = {
    filename: req.file.filename,
    originalname: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size,
    uploadedAt: new Date().toISOString(),
    url: `/media/${userId}/${dbName}/${req.file.filename}`,
    userId,
    dbName
  };
  try {
    fs.writeFileSync(
      path.join('uploads', userId, dbName, `${req.file.filename}.meta.json`),
      JSON.stringify(metadata, null, 2)
    );
  } catch (err) {
    console.error("Failed to write metadata:", err);
  }
  res.json(metadata);
});

// === GET /media/:userId/:dbName/:filename/download ===
router.get('/:userId/:dbName/:filename/download', (req, res) => {
  const filePath = path.join('uploads', req.params.userId, req.params.dbName, req.params.filename);
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) return res.status(404).json({ error: 'File not found' });
    res.download(path.resolve(filePath));
  });
});

// === GET /media/:userId/:dbName/:filename ===
router.get('/:userId/:dbName/:filename', (req, res) => {
  const filePath = path.join('uploads', req.params.userId, req.params.dbName, req.params.filename);
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) return res.status(404).json({ error: 'File not found' });
    res.sendFile(path.resolve(filePath));
  });
});

// === GET /media/meta/:userId/:dbName/:filename ===
router.get('/meta/:userId/:dbName/:filename', (req, res) => {
  const filePath = path.join('uploads', req.params.userId, req.params.dbName, req.params.filename);
  const metaPath = `${filePath}.meta.json`;
  fs.readFile(metaPath, (err, data) => {
    if (!err) return res.type('json').send(data);

    // Fallback: If the file itself exists, return minimal metadata
    fs.stat(filePath, (statErr, stats) => {
      if (statErr) return res.status(404).json({ error: 'Metadata not found' });
      return res.json({
        filename: req.params.filename,
        userId: req.params.userId,
        dbName: req.params.dbName,
        size: stats.size,
        uploadedAt: stats.birthtime,
        url: `/media/${req.params.userId}/${req.params.dbName}/${req.params.filename}`,
        note: 'Fallback metadata, no .meta.json found'
      });
    });
  });
});

// === DELETE /media/:userId/:dbName/:filename ===
router.delete('/:userId/:dbName/:filename', (req, res) => {
  const filePath = path.join('uploads', req.params.userId, req.params.dbName, req.params.filename);
  const metaPath = `${filePath}.meta.json`;
  fs.unlink(filePath, err => {
    if (err) return res.status(404).json({ error: 'File not found' });
    fs.unlink(metaPath, () => {});
    res.json({ status: 'deleted', filename: req.params.filename, userId: req.params.userId, dbName: req.params.dbName });
  });
});

// === GET /media/:userId/:dbName/ ===
// List all files for this userId/dbName
router.get('/:userId/:dbName', (req, res) => {
  const dir = path.join('uploads', req.params.userId, req.params.dbName);
  fs.readdir(dir, (err, files) => {
    if (err) return res.status(500).json({ error: err.message });
    const data = files.filter(f => !f.endsWith('.meta.json'));
    res.json(data);
  });
});

// === GET /media/:userId/:dbName/search?query=xxx ===
router.get('/:userId/:dbName/search', (req, res) => {
  const dir = path.join('uploads', req.params.userId, req.params.dbName);
  const q = (req.query.query || '').toLowerCase();
  fs.readdir(dir, (err, files) => {
    if (err) return res.status(500).json({ error: err.message });
    const matches = files.filter(f =>
      !f.endsWith('.meta.json') && f.toLowerCase().includes(q)
    );
    res.json(matches);
  });
});

export default router;
