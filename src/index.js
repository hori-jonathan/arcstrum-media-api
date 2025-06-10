import express from 'express';
import mediaRouter from './routes/media.js';

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

const PORT = 5000;
app.listen(PORT, () => console.log('Started media api server on 5000'));
