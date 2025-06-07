import express from 'express';
import cors from 'cors';
import mediaRouter from './routes/media.js';

const app = express();

const allowedOrigins = ['https://console.arcstrum.com', 'http://localhost:3000'];
const corsOptions = {
  origin: function(origin, callback) {
    if (!origin) return callback(null, true); // Allow Postman, server-to-server, etc
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions)); // MUST be before everything

app.use(express.json());
app.use('/media', mediaRouter);

// Universal OPTIONS handler for ALL routes (keeps CORS happy)
app.options('*', cors(corsOptions));

// Error handler that sets CORS headers, too:
app.use((err, req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  if (err) return res.status(500).json({ error: err.message });
  next();
});

const PORT = 5000;
app.listen(PORT, () => console.log('running'));
