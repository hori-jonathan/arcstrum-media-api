import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import mediaRouter from './routes/media.js';

const app = express();
const allowedOrigins = ['https://console.arcstrum.com', 'http://localhost:3000'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // allow non-browser or same-origin requests
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

// Ensure uploads folder exists
const uploadsPath = path.resolve('uploads');
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}

app.use('/media', mediaRouter);

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Media API running at http://localhost:${PORT}/media`);
});
