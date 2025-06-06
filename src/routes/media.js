import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = express.Router();

// -- Always upload to a temp dir
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dest = path.join('uploads', '_tmp');
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
  console.log('req.body:', req.body);
  console.log('req.file:', req.file);
  const userId = req.body.userId || req.body.user_id || req.query.userId || req.query.user_id;
  const dbName = req.body.dbName || req.body.db_name || "default";
  if (!userId || !dbName) {
    if (req.file && req.file.path) fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Missing userId or dbName' });
  }
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const destDir = path.join('uploads', userId, dbName);
  fs.mkdirSync(destDir, { recursive: true });
  const destPath = path.join(destDir, req.file.filename);

  // Move the file to its real place
  fs.renameSync(req.file.path, destPath);

  // Write metadata
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
      path.join(destDir, `${req.file.filename}.meta.json`),
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
router.get('/:userId/:dbName', (req, res) => {
  const dir = path.join('uploads', req.params.userId, req.params.dbName);
  fs.readdir(dir, (err, files) => {
    if (err) {
      if (err.code === 'ENOENT') return res.json([]);
      return res.status(500).json({ error: err.message });
    }
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
