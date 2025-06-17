import express from 'express';
import mediaRouter from './routes/media.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getPortFromFile(service, defaultPort = 5000) {
  const filePath = path.resolve(__dirname, '../../port.txt');
  const content = fs.readFileSync(filePath, 'utf-8');
  for (let line of content.split('\n')) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    const [key, value] = line.split(':').map(s => s.trim());
    if (key === service && value) return Number(value);
  }
  return defaultPort;
}

const app = express();

app.use(express.json());
app.use('/media', mediaRouter);

// Error handler that sets CORS headers, too:
app.use((err, req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  if (err) return res.status(500).json({ error: err.message });
  next();
});

const PORT = getPortFromFile('media', 5000);
app.listen(PORT, () => console.log(`Started media api server on ${PORT}`));
