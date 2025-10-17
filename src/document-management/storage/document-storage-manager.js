/**
 * Document Storage Manager
 * Handles multi-tier document storage with deduplication and compression
 */

const AWS = require('aws-sdk');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { promisify } = require('util');
const logger = require('../../utils/logger');

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

class DocumentStorageManager {
  constructor(config = {}) {
    this.config = {
      storageType: config.storageType || 'hybrid', // 'local', 's3', 'hybrid'
      localStoragePath: config.localStoragePath || './storage/documents',
      s3Config: {
        region: config.s3Region || 'us-east-1',
        bucketName: config.s3BucketName || 'finbot-documents',
        accessKeyId: config.s3AccessKeyId || process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: config.s3SecretAccessKey || process.env.AWS_SECRET_ACCESS_KEY,
        ...config.s3Config
      },
      enableCompression: config.enableCompression !== false,
      enableDeduplication: config.enableDeduplication !== false,
      chunkSize: config.chunkSize || 5 * 1024 * 1024, // 5MB chunks
      maxFileSize: config.maxFileSize || 100 * 1024 * 1024, // 100MB
      retentionPolicies: {
        hot: config.hotRetentionDays || 30,    // Frequently accessed
        warm: config.warmRetentionDays || 90,  // Occasionally accessed
        cold: config.coldRetentionDays || 365  // Rarely accessed
      },
      ...config
    };

    // Initialize storage clients
    this.s3Client = null;
    if (this.config.storageType === 's3' || this.config.storageType === 'hybrid') {
      this.s3Client = new AWS.S3({
        region: this.config.s3Config.region,
        accessKeyId: this.config.s3Config.accessKeyId,
        secretAccessKey: this.config.s3Config.secretAccessKey
      });
    }

    // File hash cache for deduplication
    this.hashCache = new Map();
    
    // Storage statistics
    this.stats = {
      totalFiles: 0,
      totalSize: 0,
      deduplicatedFiles: 0,
      compressionRatio: 0,
      storageDistribution: {
        hot: 0,
        warm: 0,
        cold: 0
      }
    };
  }

  async initialize() {
    try {
      // Create local storage directories
      if (this.config.storageType === 'local' || this.config.storageType === 'hybrid') {
        await this.createLocalDirectories();
      }

      // Verify S3 connection
      if (this.s3Client) {
        await this.verifyS3Connection();
      }

      logger.info('Document storage manager initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize document storage manager:', error);
      throw error;
    }
  }

  async createLocalDirectories() {
    const directories = [
      this.config.localStoragePath,
      path.join(this.config.localStoragePath, 'hot'),
      path.join(this.config.localStoragePath, 'warm'),
      path.join(this.config.localStoragePath, 'cold'),
      path.join(this.config.localStoragePath, 'temp'),
      path.join(this.config.localStoragePath, 'chunks')
    ];

    for (const dir of directories) {
      try {
        await fs.mkdir(dir, { recursive: true });
      } catch (error) {
        if (error.code !== 'EEXIST') {
          throw error;
        }
      }
    }
  }

  async verifyS3Connection() {
    try {
      await this.s3Client.headBucket({ Bucket: this.config.s3Config.bucketName }).promise();
    } catch (error) {
      if (error.code === 'NotFound') {
        // Create bucket if it doesn't exist
        await this.s3Client.createBucket({ 
          Bucket: this.config.s3Config.bucketName,
          CreateBucketConfiguration: {
            LocationConstraint: this.config.s3Config.region
          }
        }).promise();
      } else {
        throw error;
      }
    }
  }

  async storeDocument(documentData, metadata = {}) {
    try {
      const startTime = Date.now();
      
      // Validate file size
      if (documentData.length > this.config.maxFileSize) {
        throw new Error(`File size exceeds maximum allowed size of ${this.config.maxFileSize} bytes`);
      }

      // Calculate file hash for deduplication
      const fileHash = this.calculateHash(documentData);
      
      // Check for existing file (deduplication)
      if (this.config.enableDeduplication) {
        const existingFile = await this.findExistingFile(fileHash);
        if (existingFile) {
          logger.info(`File already exists, returning existing reference: ${existingFile.id}`);
          return {
            id: existingFile.id,
            hash: fileHash,
            size: documentData.length,
            isDuplicate: true,
            storageLocation: existingFile.storageLocation,
            tier: existingFile.tier
          };
        }
      }

      // Determine storage tier based on metadata
      const tier = this.determineStorageTier(metadata);
      
      // Compress if enabled
      let processedData = documentData;
      let isCompressed = false;
      
      if (this.config.enableCompression && documentData.length > 1024) { // Only compress files > 1KB
        processedData = await gzip(documentData);
        isCompressed = true;
      }

      // Generate unique document ID
      const documentId = this.generateDocumentId();
      
      // Store based on file size and tier
      let storageResult;
      if (processedData.length > this.config.chunkSize) {
        storageResult = await this.storeChunkedFile(documentId, processedData, tier, metadata);
      } else {
        storageResult = await this.storeSingleFile(documentId, processedData, tier, metadata);
      }

      // Update hash cache
      if (this.config.enableDeduplication) {
        this.hashCache.set(fileHash, {
          id: documentId,
          storageLocation: storageResult.location,
          tier: tier,
          timestamp: new Date()
        });
      }

      // Update statistics
      this.updateStats(documentData.length, processedData.length, tier, isCompressed);

      const processingTime = Date.now() - startTime;

      return {
        id: documentId,
        hash: fileHash,
        originalSize: documentData.length,
        storedSize: processedData.length,
        isCompressed,
        compressionRatio: isCompressed ? (documentData.length / processedData.length) : 1,
        tier,
        storageLocation: storageResult.location,
        chunks: storageResult.chunks || null,
        processingTime,
        isDuplicate: false
      };

    } catch (error) {
      logger.error('Document storage failed:', error);
      throw error;
    }
  }

  async retrieveDocument(documentId, options = {}) {
    try {
      const startTime = Date.now();
      
      // Get document metadata
      const metadata = await this.getDocumentMetadata(documentId);
      if (!metadata) {
        throw new Error(`Document not found: ${documentId}`);
      }

      let documentData;

      // Retrieve based on storage type
      if (metadata.chunks) {
        documentData = await this.retrieveChunkedFile(documentId, metadata);
      } else {
        documentData = await this.retrieveSingleFile(documentId, metadata);
      }

      // Decompress if needed
      if (metadata.isCompressed) {
        documentData = await gunzip(documentData);
      }

      // Update access statistics (for tier management)
      await this.updateAccessStats(documentId);

      const retrievalTime = Date.now() - startTime;

      return {
        data: documentData,
        metadata: metadata,
        retrievalTime
      };

    } catch (error) {
      logger.error('Document retrieval failed:', error);
      throw error;
    }
  }

  async deleteDocument(documentId, options = {}) {
    try {
      // Get document metadata
      const metadata = await this.getDocumentMetadata(documentId);
      if (!metadata) {
        throw new Error(`Document not found: ${documentId}`);
      }

      // Check if this is the last reference (for deduplication)
      if (this.config.enableDeduplication && !options.force) {
        const referenceCount = await this.getDocumentReferenceCount(metadata.hash);
        if (referenceCount > 1) {
          // Just remove the reference, don't delete the actual file
          await this.removeDocumentReference(documentId);
          return { deleted: false, reason: 'Multiple references exist' };
        }
      }

      // Delete actual file(s)
      if (metadata.chunks) {
        await this.deleteChunkedFile(documentId, metadata);
      } else {
        await this.deleteSingleFile(documentId, metadata);
      }

      // Remove from hash cache
      if (metadata.hash) {
        this.hashCache.delete(metadata.hash);
      }

      // Update statistics
      this.stats.totalFiles--;
      this.stats.totalSize -= metadata.originalSize || 0;
      this.stats.storageDistribution[metadata.tier]--;

      return { deleted: true };

    } catch (error) {
      logger.error('Document deletion failed:', error);
      throw error;
    }
  }

  async storeSingleFile(documentId, data, tier, metadata) {
    const fileName = `${documentId}.dat`;
    
    if (this.config.storageType === 'local' || 
        (this.config.storageType === 'hybrid' && tier === 'hot')) {
      
      // Store locally
      const filePath = path.join(this.config.localStoragePath, tier, fileName);
      await fs.writeFile(filePath, data);
      
      return {
        location: 'local',
        path: filePath,
        tier: tier
      };
      
    } else if (this.s3Client) {
      
      // Store in S3
      const key = `${tier}/${documentId}/${fileName}`;
      
      await this.s3Client.upload({
        Bucket: this.config.s3Config.bucketName,
        Key: key,
        Body: data,
        Metadata: {
          originalName: metadata.originalName || '',
          contentType: metadata.contentType || 'application/octet-stream',
          tier: tier
        }
      }).promise();
      
      return {
        location: 's3',
        bucket: this.config.s3Config.bucketName,
        key: key,
        tier: tier
      };
    }
    
    throw new Error('No valid storage backend configured');
  }

  async storeChunkedFile(documentId, data, tier, metadata) {
    const chunks = [];
    const chunkSize = this.config.chunkSize;
    
    // Split data into chunks
    for (let i = 0; i < data.length; i += chunkSize) {
      const chunkData = data.slice(i, i + chunkSize);
      const chunkIndex = Math.floor(i / chunkSize);
      const chunkId = `${documentId}_chunk_${chunkIndex}`;
      
      const chunkResult = await this.storeSingleFile(chunkId, chunkData, tier, {
        ...metadata,
        isChunk: true,
        chunkIndex: chunkIndex,
        parentDocument: documentId
      });
      
      chunks.push({
        index: chunkIndex,
        id: chunkId,
        size: chunkData.length,
        location: chunkResult
      });
    }
    
    // Store chunk manifest
    const manifest = {
      documentId: documentId,
      totalChunks: chunks.length,
      totalSize: data.length,
      chunks: chunks
    };
    
    const manifestData = Buffer.from(JSON.stringify(manifest));
    const manifestResult = await this.storeSingleFile(`${documentId}_manifest`, manifestData, tier, {
      ...metadata,
      isManifest: true
    });
    
    return {
      location: 'chunked',
      chunks: chunks,
      manifest: manifestResult
    };
  }

  async retrieveSingleFile(documentId, metadata) {
    const fileName = `${documentId}.dat`;
    
    if (metadata.storageLocation === 'local') {
      const filePath = path.join(this.config.localStoragePath, metadata.tier, fileName);
      return await fs.readFile(filePath);
      
    } else if (metadata.storageLocation === 's3' && this.s3Client) {
      const key = `${metadata.tier}/${documentId}/${fileName}`;
      
      const result = await this.s3Client.getObject({
        Bucket: this.config.s3Config.bucketName,
        Key: key
      }).promise();
      
      return result.Body;
    }
    
    throw new Error(`Cannot retrieve file from location: ${metadata.storageLocation}`);
  }

  async retrieveChunkedFile(documentId, metadata) {
    // Get chunk manifest
    const manifestData = await this.retrieveSingleFile(`${documentId}_manifest`, {
      ...metadata,
      storageLocation: metadata.storageLocation
    });
    
    const manifest = JSON.parse(manifestData.toString());
    
    // Retrieve all chunks
    const chunkPromises = manifest.chunks.map(async (chunk) => {
      const chunkData = await this.retrieveSingleFile(chunk.id, {
        ...metadata,
        storageLocation: chunk.location.location
      });
      return { index: chunk.index, data: chunkData };
    });
    
    const chunkResults = await Promise.all(chunkPromises);
    
    // Sort chunks by index and concatenate
    chunkResults.sort((a, b) => a.index - b.index);
    const buffers = chunkResults.map(chunk => chunk.data);
    
    return Buffer.concat(buffers);
  }

  async deleteSingleFile(documentId, metadata) {
    const fileName = `${documentId}.dat`;
    
    if (metadata.storageLocation === 'local') {
      const filePath = path.join(this.config.localStoragePath, metadata.tier, fileName);
      await fs.unlink(filePath);
      
    } else if (metadata.storageLocation === 's3' && this.s3Client) {
      const key = `${metadata.tier}/${documentId}/${fileName}`;
      
      await this.s3Client.deleteObject({
        Bucket: this.config.s3Config.bucketName,
        Key: key
      }).promise();
    }
  }

  async deleteChunkedFile(documentId, metadata) {
    // Get chunk manifest
    const manifestData = await this.retrieveSingleFile(`${documentId}_manifest`, metadata);
    const manifest = JSON.parse(manifestData.toString());
    
    // Delete all chunks
    const deletePromises = manifest.chunks.map(chunk => 
      this.deleteSingleFile(chunk.id, {
        ...metadata,
        storageLocation: chunk.location.location
      })
    );
    
    await Promise.all(deletePromises);
    
    // Delete manifest
    await this.deleteSingleFile(`${documentId}_manifest`, metadata);
  }

  determineStorageTier(metadata) {
    // Default tier determination logic
    if (metadata.priority === 'high' || metadata.accessFrequency === 'frequent') {
      return 'hot';
    } else if (metadata.accessFrequency === 'occasional') {
      return 'warm';
    } else {
      return 'cold';
    }
  }

  calculateHash(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  generateDocumentId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2);
    return `doc_${timestamp}_${random}`;
  }

  async findExistingFile(hash) {
    // Check cache first
    const cached = this.hashCache.get(hash);
    if (cached) {
      return cached;
    }

    // In a real implementation, this would query a database
    // For now, return null (no existing file found)
    return null;
  }

  async getDocumentMetadata(documentId) {
    // In a real implementation, this would query a database
    // For now, return mock metadata
    return {
      id: documentId,
      hash: 'mock_hash',
      originalSize: 1024,
      storedSize: 512,
      isCompressed: true,
      tier: 'hot',
      storageLocation: 'local',
      chunks: null
    };
  }

  async getDocumentReferenceCount(hash) {
    // In a real implementation, this would query a database
    return 1;
  }

  async removeDocumentReference(documentId) {
    // In a real implementation, this would update a database
    logger.info(`Removed reference for document: ${documentId}`);
  }

  async updateAccessStats(documentId) {
    // In a real implementation, this would update access statistics in a database
    logger.debug(`Updated access stats for document: ${documentId}`);
  }

  updateStats(originalSize, storedSize, tier, isCompressed) {
    this.stats.totalFiles++;
    this.stats.totalSize += originalSize;
    this.stats.storageDistribution[tier]++;
    
    if (isCompressed) {
      const compressionRatio = originalSize / storedSize;
      this.stats.compressionRatio = 
        (this.stats.compressionRatio * (this.stats.totalFiles - 1) + compressionRatio) / this.stats.totalFiles;
    }
  }

  // Tier management methods

  async promoteTier(documentId, newTier) {
    const metadata = await this.getDocumentMetadata(documentId);
    if (!metadata) {
      throw new Error(`Document not found: ${documentId}`);
    }

    if (metadata.tier === newTier) {
      return { promoted: false, reason: 'Already in target tier' };
    }

    // Retrieve document
    const { data } = await this.retrieveDocument(documentId);
    
    // Delete from current tier
    await this.deleteDocument(documentId, { force: true });
    
    // Store in new tier
    const result = await this.storeDocument(data, { ...metadata, tier: newTier });
    
    return { promoted: true, newTier, documentId: result.id };
  }

  async demoteTier(documentId, newTier) {
    return await this.promoteTier(documentId, newTier);
  }

  async optimizeStorage() {
    // Implement storage optimization logic
    // - Move infrequently accessed files to colder tiers
    // - Clean up orphaned chunks
    // - Compress uncompressed files
    
    logger.info('Starting storage optimization...');
    
    const optimizationResults = {
      filesProcessed: 0,
      spaceReclaimed: 0,
      tiersOptimized: 0
    };
    
    // This would be implemented with actual file scanning and optimization
    
    logger.info('Storage optimization completed', optimizationResults);
    return optimizationResults;
  }

  getStorageStats() {
    return {
      ...this.stats,
      cacheSize: this.hashCache.size,
      config: {
        storageType: this.config.storageType,
        enableCompression: this.config.enableCompression,
        enableDeduplication: this.config.enableDeduplication,
        maxFileSize: this.config.maxFileSize,
        chunkSize: this.config.chunkSize
      }
    };
  }

  async healthCheck() {
    const health = {
      status: 'healthy',
      storage: {
        local: false,
        s3: false
      },
      stats: this.getStorageStats()
    };

    // Check local storage
    if (this.config.storageType === 'local' || this.config.storageType === 'hybrid') {
      try {
        await fs.access(this.config.localStoragePath);
        health.storage.local = true;
      } catch (error) {
        health.status = 'degraded';
        health.storage.local = false;
      }
    }

    // Check S3 storage
    if (this.s3Client) {
      try {
        await this.s3Client.headBucket({ Bucket: this.config.s3Config.bucketName }).promise();
        health.storage.s3 = true;
      } catch (error) {
        health.status = 'degraded';
        health.storage.s3 = false;
      }
    }

    return health;
  }
}

module.exports = DocumentStorageManager;