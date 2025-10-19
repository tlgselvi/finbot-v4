import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { connectDatabase, checkDatabaseHealth } from './lib/database';
import { connectRedis, checkRedisHealth } from './lib/redis';

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
app.get('/health', async (req, res) => {
  try {
    const dbHealth = await checkDatabaseHealth();
    const redisHealth = await checkRedisHealth();
    
    const isHealthy = dbHealth.status === 'healthy' && redisHealth.status === 'healthy';
    
    res.status(isHealthy ? 200 : 503).json({ 
      status: isHealthy ? 'OK' : 'UNHEALTHY',
      timestamp: new Date().toISOString(),
      service: 'FinBot Backend API',
      database: dbHealth,
      redis: redisHealth
    });
  } catch (error) {
    res.status(503).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      service: 'FinBot Backend API',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
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

// Initialize services and start server
async function startServer() {
  try {
    console.log('🚀 Starting FinBot Backend API...');
    
    // Connect to database
    const dbConnected = await connectDatabase();
    if (!dbConnected) {
      console.error('❌ Failed to connect to database');
      process.exit(1);
    }
    
    // Connect to Redis
    try {
      await connectRedis();
    } catch (error) {
      console.error('❌ Failed to connect to Redis:', error);
      process.exit(1);
    }
    
    // Start server
    app.listen(PORT, () => {
      console.log(`✅ FinBot Backend API running on port ${PORT}`);
      console.log(`🔗 Health check: http://localhost:${PORT}/health`);
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  process.exit(0);
});

// Start the server
startServer();