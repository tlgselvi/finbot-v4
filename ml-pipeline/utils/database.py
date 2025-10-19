"""
Database Manager
Handles database connections and operations for ML pipeline
"""

import asyncio
import logging
from typing import Dict, List, Optional, Any
import asyncpg
import json
from datetime import datetime

logger = logging.getLogger(__name__)

class DatabaseManager:
    """
    Async database manager for PostgreSQL operations
    """
    
    def __init__(self):
        self.pool = None
        self.is_initialized = False
    
    async def initialize(self, database_url: str, 
                        min_connections: int = 5, 
                        max_connections: int = 20) -> bool:
        """
        Initialize database connection pool
        
        Args:
            database_url: PostgreSQL connection URL
            min_connections: Minimum pool connections
            max_connections: Maximum pool connections
            
        Returns:
            True if successful, False otherwise
        """
        try:
            self.pool = await asyncpg.create_pool(
                database_url,
                min_size=min_connections,
                max_size=max_connections,
                command_timeout=60
            )
            
            # Test connection
            async with self.pool.acquire() as conn:
                await conn.fetchval('SELECT 1')
            
            self.is_initialized = True
            logger.info("Database connection pool initialized")
            return True
            
        except Exception as e:
            logger.error(f"Database initialization error: {str(e)}")
            return False
    
    async def execute_query(self, query: str, params: Optional[Dict] = None) -> List[Dict]:
        """
        Execute a query and return results
        
        Args:
            query: SQL query string
            params: Query parameters
            
        Returns:
            List of result dictionaries
        """
        if not self.is_initialized:
            raise ValueError("Database not initialized")
        
        try:
            async with self.pool.acquire() as conn:
                if params:
                    # Convert named parameters to positional for asyncpg
                    query_formatted, values = self._format_query(query, params)
                    rows = await conn.fetch(query_formatted, *values)
                else:
                    rows = await conn.fetch(query)
                
                # Convert rows to dictionaries
                return [dict(row) for row in rows]
                
        except Exception as e:
            logger.error(f"Query execution error: {str(e)}")
            raise
    
    async def execute_insert(self, query: str, params: Optional[Dict] = None) -> Optional[Any]:
        """
        Execute an insert query and return the inserted ID
        
        Args:
            query: SQL insert query
            params: Query parameters
            
        Returns:
            Inserted record ID or None
        """
        if not self.is_initialized:
            raise ValueError("Database not initialized")
        
        try:
            async with self.pool.acquire() as conn:
                if params:
                    query_formatted, values = self._format_query(query, params)
                    result = await conn.fetchval(query_formatted, *values)
                else:
                    result = await conn.fetchval(query)
                
                return result
                
        except Exception as e:
            logger.error(f"Insert execution error: {str(e)}")
            raise
    
    async def execute_update(self, query: str, params: Optional[Dict] = None) -> int:
        """
        Execute an update query and return affected rows count
        
        Args:
            query: SQL update query
            params: Query parameters
            
        Returns:
            Number of affected rows
        """
        if not self.is_initialized:
            raise ValueError("Database not initialized")
        
        try:
            async with self.pool.acquire() as conn:
                if params:
                    query_formatted, values = self._format_query(query, params)
                    result = await conn.execute(query_formatted, *values)
                else:
                    result = await conn.execute(query)
                
                # Extract number from result string like "UPDATE 5"
                return int(result.split()[-1]) if result else 0
                
        except Exception as e:
            logger.error(f"Update execution error: {str(e)}")
            raise
    
    def _format_query(self, query: str, params: Dict) -> tuple:
        """
        Convert named parameters to positional parameters for asyncpg
        
        Args:
            query: SQL query with named parameters (:param_name)
            params: Dictionary of parameters
            
        Returns:
            Tuple of (formatted_query, values_list)
        """
        values = []
        formatted_query = query
        
        # Sort parameters by length (longest first) to avoid partial replacements
        sorted_params = sorted(params.items(), key=lambda x: len(x[0]), reverse=True)
        
        for param_name, param_value in sorted_params:
            placeholder = f":{param_name}"
            if placeholder in formatted_query:
                values.append(param_value)
                # Replace with positional parameter ($1, $2, etc.)
                formatted_query = formatted_query.replace(
                    placeholder, f"${len(values)}", 1
                )
        
        return formatted_query, values
    
    async def create_tables(self) -> bool:
        """
        Create necessary tables for anomaly detection
        
        Returns:
            True if successful, False otherwise
        """
        try:
            create_queries = [
                """
                CREATE TABLE IF NOT EXISTS anomaly_detections (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    transaction_id UUID NOT NULL,
                    user_id UUID NOT NULL,
                    is_anomaly BOOLEAN NOT NULL DEFAULT FALSE,
                    anomaly_score DECIMAL(5,4) NOT NULL DEFAULT 0,
                    confidence DECIMAL(5,4) NOT NULL DEFAULT 0,
                    alert_level VARCHAR(20) NOT NULL DEFAULT 'low',
                    explanation JSONB,
                    detection_timestamp TIMESTAMP DEFAULT NOW(),
                    created_at TIMESTAMP DEFAULT NOW()
                );
                """,
                """
                CREATE INDEX IF NOT EXISTS idx_anomaly_detections_user_id 
                ON anomaly_detections(user_id);
                """,
                """
                CREATE INDEX IF NOT EXISTS idx_anomaly_detections_transaction_id 
                ON anomaly_detections(transaction_id);
                """,
                """
                CREATE INDEX IF NOT EXISTS idx_anomaly_detections_timestamp 
                ON anomaly_detections(detection_timestamp);
                """,
                """
                CREATE INDEX IF NOT EXISTS idx_anomaly_detections_is_anomaly 
                ON anomaly_detections(is_anomaly);
                """
            ]
            
            for query in create_queries:
                await self.execute_query(query)
            
            logger.info("Database tables created successfully")
            return True
            
        except Exception as e:
            logger.error(f"Table creation error: {str(e)}")
            return False
    
    async def get_connection_info(self) -> Dict:
        """
        Get database connection information
        
        Returns:
            Connection info dictionary
        """
        if not self.is_initialized:
            return {'status': 'not_initialized'}
        
        try:
            async with self.pool.acquire() as conn:
                version = await conn.fetchval('SELECT version()')
                current_time = await conn.fetchval('SELECT NOW()')
                
                return {
                    'status': 'connected',
                    'pool_size': len(self.pool._holders),
                    'pool_max_size': self.pool._maxsize,
                    'pool_min_size': self.pool._minsize,
                    'server_version': version,
                    'server_time': current_time.isoformat() if current_time else None
                }
                
        except Exception as e:
            logger.error(f"Error getting connection info: {str(e)}")
            return {
                'status': 'error',
                'error': str(e)
            }
    
    async def cleanup(self) -> None:
        """
        Cleanup database connections
        """
        try:
            if self.pool:
                await self.pool.close()
                self.pool = None
            
            self.is_initialized = False
            logger.info("Database connections cleaned up")
            
        except Exception as e:
            logger.error(f"Database cleanup error: {str(e)}")