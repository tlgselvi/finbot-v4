import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'FinBot Backend API'
  });
});

// API routes
app.get('/api/dashboard', (req, res) => {
  res.json({
    success: true,
    data: {
      totalSpending: 1500,
      budgetRemaining: 2500,
      savingsRate: 0.15,
      goalProgress: 0.65
    }
  });
});

app.get('/api/insights', (req, res) => {
  res.json({
    success: true,
    data: [
      {
        id: 1,
        title: 'Spending Pattern Change',
        description: 'Your dining expenses increased by 25%',
        priority: 'high',
        confidence: 0.89
      }
    ]
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 FinBot Backend API running on port ${PORT}`);
});