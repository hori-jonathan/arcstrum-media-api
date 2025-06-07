import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import mediaRouter from './routes/media.js';

const app = express();

const allowedOrigins = ['https://console.arcstrum.com', 'http://localhost:3000'];
const corsOptions = {
  origin: function(origin, callback) {
    if (!origin) return callback(null, true); // allow non-browser, Postman, same-origin
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));

// THIS replaces any app.options('*', ...) usage:
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') res.sendStatus(204);
  else next();
});

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
