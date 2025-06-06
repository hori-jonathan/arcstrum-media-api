import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import mediaRouter from './routes/media.js';

const app = express();
app.use(cors()); // For development, allows all origins

// Ensure uploads folder exists
const uploadsPath = path.resolve('uploads');
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}

app.use('/media', mediaRouter);

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`Media API running at http://localhost:${PORT}/media`);
});
