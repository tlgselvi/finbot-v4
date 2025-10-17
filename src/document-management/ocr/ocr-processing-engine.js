/**
 * OCR Processing Engine
 * Multi-provider OCR system with confidence scoring and failover
 */

const axios = require('axios');
const FormData = require('form-data');
const sharp = require('sharp');
const tesseract = require('tesseract.js');
const logger = require('../../utils/logger');

class OCRProcessingEngine {
  constructor(config = {}) {
    this.config = {
      providers: config.providers || ['google_vision', 'aws_textract', 'tesseract'],
      primaryProvider: config.primaryProvider || 'google_vision',
      fallbackEnabled: config.fallbackEnabled !== false,
      confidenceThreshold: config.confidenceThreshold || 0.7,
      maxRetries: config.maxRetries || 2,
      timeout: config.timeout || 30000,
      enablePreprocessing: config.enablePreprocessing !== false,
      enablePostprocessing: config.enablePostprocessing !== false,
      ...config
    };

    // Provider configurations
    this.providerConfigs = {
      google_vision: {
        apiKey: process.env.GOOGLE_VISION_API_KEY,
        endpoint: 'https://vision.googleapis.com/v1/images:annotate',
        maxFileSize: 20 * 1024 * 1024, // 20MB
        supportedFormats: ['jpeg', 'png', 'gif', 'bmp', 'webp', 'pdf'],
        reliability: 0.95,
        costPerRequest: 0.0015
      },
      aws_textract: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        region: process.env.AWS_REGION || 'us-east-1',
        maxFileSize: 10 * 1024 * 1024, // 10MB
        supportedFormats: ['jpeg', 'png', 'pdf'],
        reliability: 0.90,
        costPerRequest: 0.0010
      },
      tesseract: {
        language: config.tesseractLanguage || 'eng',
        maxFileSize: 50 * 1024 * 1024, // 50MB
        supportedFormats: ['jpeg', 'png', 'bmp', 'tiff'],
        reliability: 0.75,
        costPerRequest: 0 // Free
      }
    };

    // Initialize AWS Textract if configured
    if (this.providerConfigs.aws_textract.accessKeyId) {
      const AWS = require('aws-sdk');
      this.textractClient = new AWS.Textract({
        accessKeyId: this.providerConfigs.aws_textract.accessKeyId,
        secretAccessKey: this.providerConfigs.aws_textract.secretAccessKey,
        region: this.providerConfigs.aws_textract.region
      });
    }

    // Processing statistics
    this.stats = {
      totalProcessed: 0,
      successfulExtractions: 0,
      failedExtractions: 0,
      averageConfidence: 0,
      providerUsage: {},
      averageProcessingTime: 0
    };

    // Initialize provider usage stats
    this.config.providers.forEach(provider => {
      this.stats.providerUsage[provider] = {
        requests: 0,
        successes: 0,
        failures: 0,
        avgConfidence: 0,
        avgProcessingTime: 0
      };
    });
  }

  async processDocument(documentBuffer, options = {}) {
    const startTime = Date.now();
    
    try {
      const {
        filename = 'document',
        mimeType = 'image/jpeg',
        language = 'en',
        extractionType = 'text', // 'text', 'tables', 'forms', 'all'
        enableStructuredExtraction = false
      } = options;

      // Validate input
      if (!documentBuffer || documentBuffer.length === 0) {
        throw new Error('Invalid document buffer');
      }

      // Preprocess image if enabled
      let processedBuffer = documentBuffer;
      if (this.config.enablePreprocessing) {
        processedBuffer = await this.preprocessImage(documentBuffer, mimeType);
      }

      // Determine file format
      const format = this.getFileFormat(mimeType, filename);
      
      // Select appropriate providers based on format and requirements
      const availableProviders = this.selectProviders(format, extractionType);
      
      if (availableProviders.length === 0) {
        throw new Error(`No suitable OCR providers available for format: ${format}`);
      }

      // Process with primary provider first
      let result = null;
      let lastError = null;

      for (const provider of availableProviders) {
        try {
          logger.debug(`Attempting OCR with provider: ${provider}`);
          
          result = await this.processWithProvider(
            provider, 
            processedBuffer, 
            { format, language, extractionType, enableStructuredExtraction }
          );

          // Check confidence threshold
          if (result.confidence >= this.config.confidenceThreshold) {
            break;
          } else if (!this.config.fallbackEnabled) {
            logger.warn(`Low confidence (${result.confidence}) but fallback disabled`);
            break;
          } else {
            logger.warn(`Low confidence (${result.confidence}), trying next provider`);
            lastError = new Error(`Low confidence: ${result.confidence}`);
          }

        } catch (error) {
          logger.warn(`OCR failed with provider ${provider}:`, error.message);
          lastError = error;
          
          this.updateProviderStats(provider, false, Date.now() - startTime);
          
          if (!this.config.fallbackEnabled) {
            throw error;
          }
        }
      }

      if (!result) {
        throw lastError || new Error('All OCR providers failed');
      }

      // Post-process results if enabled
      if (this.config.enablePostprocessing) {
        result = await this.postprocessResults(result);
      }

      // Update statistics
      const processingTime = Date.now() - startTime;
      this.updateStats(true, result.confidence, processingTime);
      this.updateProviderStats(result.provider, true, processingTime, result.confidence);

      // Add metadata
      result.metadata = {
        processingTime,
        fileSize: documentBuffer.length,
        format,
        preprocessed: this.config.enablePreprocessing,
        postprocessed: this.config.enablePostprocessing,
        timestamp: new Date().toISOString()
      };

      logger.info(`OCR completed successfully with ${result.provider} in ${processingTime}ms`);
      
      return result;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.updateStats(false, 0, processingTime);
      
      logger.error('OCR processing failed:', error);
      throw error;
    }
  }

  async processWithProvider(provider, buffer, options) {
    switch (provider) {
      case 'google_vision':
        return await this.processWithGoogleVision(buffer, options);
      case 'aws_textract':
        return await this.processWithAWSTextract(buffer, options);
      case 'tesseract':
        return await this.processWithTesseract(buffer, options);
      default:
        throw new Error(`Unknown OCR provider: ${provider}`);
    }
  }

  async processWithGoogleVision(buffer, options) {
    const config = this.providerConfigs.google_vision;
    
    if (!config.apiKey) {
      throw new Error('Google Vision API key not configured');
    }

    const base64Image = buffer.toString('base64');
    
    const requestBody = {
      requests: [{
        image: {
          content: base64Image
        },
        features: this.getGoogleVisionFeatures(options.extractionType),
        imageContext: {
          languageHints: [options.language || 'en']
        }
      }]
    };

    const response = await axios.post(
      `${config.endpoint}?key=${config.apiKey}`,
      requestBody,
      {
        timeout: this.config.timeout,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.responses[0].error) {
      throw new Error(`Google Vision API error: ${response.data.responses[0].error.message}`);
    }

    return this.parseGoogleVisionResponse(response.data.responses[0], options);
  }

  async processWithAWSTextract(buffer, options) {
    if (!this.textractClient) {
      throw new Error('AWS Textract not configured');
    }

    const params = {
      Document: {
        Bytes: buffer
      }
    };

    let result;
    
    if (options.extractionType === 'tables' || options.extractionType === 'forms') {
      // Use AnalyzeDocument for structured data
      params.FeatureTypes = [];
      if (options.extractionType === 'tables' || options.extractionType === 'all') {
        params.FeatureTypes.push('TABLES');
      }
      if (options.extractionType === 'forms' || options.extractionType === 'all') {
        params.FeatureTypes.push('FORMS');
      }
      
      result = await this.textractClient.analyzeDocument(params).promise();
    } else {
      // Use DetectDocumentText for simple text extraction
      result = await this.textractClient.detectDocumentText(params).promise();
    }

    return this.parseAWSTextractResponse(result, options);
  }

  async processWithTesseract(buffer, options) {
    const config = this.providerConfigs.tesseract;
    
    const tesseractOptions = {
      lang: config.language,
      oem: 1, // LSTM OCR Engine Mode
      psm: 3  // Fully automatic page segmentation
    };

    const { data } = await tesseract.recognize(buffer, tesseractOptions);
    
    return this.parseTesseractResponse(data, options);
  }

  getGoogleVisionFeatures(extractionType) {
    const features = [];
    
    switch (extractionType) {
      case 'text':
        features.push({ type: 'TEXT_DETECTION' });
        break;
      case 'tables':
        features.push({ type: 'DOCUMENT_TEXT_DETECTION' });
        break;
      case 'all':
        features.push(
          { type: 'TEXT_DETECTION' },
          { type: 'DOCUMENT_TEXT_DETECTION' }
        );
        break;
      default:
        features.push({ type: 'TEXT_DETECTION' });
    }
    
    return features;
  }

  parseGoogleVisionResponse(response, options) {
    const textAnnotations = response.textAnnotations || [];
    const fullTextAnnotation = response.fullTextAnnotation;
    
    if (textAnnotations.length === 0) {
      return {
        provider: 'google_vision',
        text: '',
        confidence: 0,
        words: [],
        lines: [],
        blocks: []
      };
    }

    // Extract full text
    const fullText = textAnnotations[0].description || '';
    
    // Calculate average confidence
    let totalConfidence = 0;
    let confidenceCount = 0;
    
    const words = [];
    const lines = [];
    const blocks = [];

    if (fullTextAnnotation) {
      // Process pages, blocks, paragraphs, words
      fullTextAnnotation.pages?.forEach(page => {
        page.blocks?.forEach(block => {
          const blockText = [];
          const blockWords = [];
          
          block.paragraphs?.forEach(paragraph => {
            paragraph.words?.forEach(word => {
              const wordText = word.symbols?.map(s => s.text).join('') || '';
              const wordConfidence = word.confidence || 0;
              
              words.push({
                text: wordText,
                confidence: wordConfidence,
                boundingBox: this.convertBoundingBox(word.boundingBox)
              });
              
              blockWords.push(wordText);
              totalConfidence += wordConfidence;
              confidenceCount++;
            });
          });
          
          blocks.push({
            text: blockWords.join(' '),
            confidence: block.confidence || 0,
            boundingBox: this.convertBoundingBox(block.boundingBox)
          });
        });
      });
    }

    const averageConfidence = confidenceCount > 0 ? totalConfidence / confidenceCount : 0;

    return {
      provider: 'google_vision',
      text: fullText,
      confidence: averageConfidence,
      words,
      lines,
      blocks,
      rawResponse: response
    };
  }

  parseAWSTextractResponse(response, options) {
    const blocks = response.Blocks || [];
    
    let fullText = '';
    const words = [];
    const lines = [];
    const textBlocks = [];
    let totalConfidence = 0;
    let confidenceCount = 0;

    blocks.forEach(block => {
      if (block.BlockType === 'WORD') {
        words.push({
          text: block.Text,
          confidence: block.Confidence / 100, // Convert to 0-1 scale
          boundingBox: this.convertAWSBoundingBox(block.Geometry.BoundingBox)
        });
        
        totalConfidence += block.Confidence / 100;
        confidenceCount++;
      } else if (block.BlockType === 'LINE') {
        lines.push({
          text: block.Text,
          confidence: block.Confidence / 100,
          boundingBox: this.convertAWSBoundingBox(block.Geometry.BoundingBox)
        });
        
        fullText += block.Text + '\n';
      }
    });

    const averageConfidence = confidenceCount > 0 ? totalConfidence / confidenceCount : 0;

    return {
      provider: 'aws_textract',
      text: fullText.trim(),
      confidence: averageConfidence,
      words,
      lines,
      blocks: textBlocks,
      rawResponse: response
    };
  }

  parseTesseractResponse(data, options) {
    const words = data.words?.map(word => ({
      text: word.text,
      confidence: word.confidence / 100, // Convert to 0-1 scale
      boundingBox: {
        left: word.bbox.x0,
        top: word.bbox.y0,
        width: word.bbox.x1 - word.bbox.x0,
        height: word.bbox.y1 - word.bbox.y0
      }
    })) || [];

    const lines = data.lines?.map(line => ({
      text: line.text,
      confidence: line.confidence / 100,
      boundingBox: {
        left: line.bbox.x0,
        top: line.bbox.y0,
        width: line.bbox.x1 - line.bbox.x0,
        height: line.bbox.y1 - line.bbox.y0
      }
    })) || [];

    return {
      provider: 'tesseract',
      text: data.text || '',
      confidence: (data.confidence || 0) / 100,
      words,
      lines,
      blocks: [],
      rawResponse: data
    };
  }

  async preprocessImage(buffer, mimeType) {
    try {
      // Use Sharp for image preprocessing
      let image = sharp(buffer);
      
      // Get image metadata
      const metadata = await image.metadata();
      
      // Enhance image for better OCR
      image = image
        .resize(null, null, { 
          withoutEnlargement: true,
          fit: 'inside',
          kernel: sharp.kernel.lanczos3
        })
        .normalize() // Normalize contrast
        .sharpen() // Sharpen edges
        .grayscale(); // Convert to grayscale
      
      // Apply additional enhancements based on image characteristics
      if (metadata.density && metadata.density < 150) {
        // Low DPI image, apply more aggressive sharpening
        image = image.sharpen(2, 1, 2);
      }
      
      return await image.jpeg({ quality: 95 }).toBuffer();
      
    } catch (error) {
      logger.warn('Image preprocessing failed, using original:', error.message);
      return buffer;
    }
  }

  async postprocessResults(result) {
    try {
      // Clean up text
      let cleanedText = result.text
        .replace(/\s+/g, ' ') // Normalize whitespace
        .replace(/[^\w\s\.\,\!\?\-\(\)]/g, '') // Remove special characters
        .trim();

      // Spell check and correction (basic implementation)
      cleanedText = this.basicSpellCheck(cleanedText);

      // Update result
      result.text = cleanedText;
      result.originalText = result.text; // Keep original for reference
      
      return result;
      
    } catch (error) {
      logger.warn('Post-processing failed:', error.message);
      return result;
    }
  }

  basicSpellCheck(text) {
    // Basic spell checking - replace common OCR errors
    const corrections = {
      '0': 'O', // Zero to letter O
      '1': 'I', // One to letter I
      '5': 'S', // Five to letter S
      '8': 'B', // Eight to letter B
      'rn': 'm', // Common OCR error
      'cl': 'd', // Common OCR error
    };

    let correctedText = text;
    Object.entries(corrections).forEach(([wrong, correct]) => {
      const regex = new RegExp(`\\b${wrong}\\b`, 'gi');
      correctedText = correctedText.replace(regex, correct);
    });

    return correctedText;
  }

  selectProviders(format, extractionType) {
    const availableProviders = [];
    
    for (const provider of this.config.providers) {
      const config = this.providerConfigs[provider];
      
      if (config.supportedFormats.includes(format)) {
        // Check if provider supports the extraction type
        if (extractionType === 'tables' || extractionType === 'forms') {
          if (provider === 'tesseract') {
            continue; // Tesseract doesn't support structured extraction
          }
        }
        
        availableProviders.push(provider);
      }
    }

    // Sort by reliability (primary provider first if available)
    availableProviders.sort((a, b) => {
      if (a === this.config.primaryProvider) return -1;
      if (b === this.config.primaryProvider) return 1;
      return this.providerConfigs[b].reliability - this.providerConfigs[a].reliability;
    });

    return availableProviders;
  }

  getFileFormat(mimeType, filename) {
    // Extract format from MIME type or filename
    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpeg';
    if (mimeType.includes('png')) return 'png';
    if (mimeType.includes('gif')) return 'gif';
    if (mimeType.includes('bmp')) return 'bmp';
    if (mimeType.includes('tiff')) return 'tiff';
    if (mimeType.includes('webp')) return 'webp';
    if (mimeType.includes('pdf')) return 'pdf';
    
    // Fallback to filename extension
    const extension = filename.split('.').pop()?.toLowerCase();
    return extension || 'jpeg';
  }

  convertBoundingBox(boundingBox) {
    if (!boundingBox || !boundingBox.vertices) return null;
    
    const vertices = boundingBox.vertices;
    const xs = vertices.map(v => v.x || 0);
    const ys = vertices.map(v => v.y || 0);
    
    return {
      left: Math.min(...xs),
      top: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys)
    };
  }

  convertAWSBoundingBox(boundingBox) {
    return {
      left: boundingBox.Left,
      top: boundingBox.Top,
      width: boundingBox.Width,
      height: boundingBox.Height
    };
  }

  updateStats(success, confidence, processingTime) {
    this.stats.totalProcessed++;
    
    if (success) {
      this.stats.successfulExtractions++;
      
      // Update average confidence
      const totalSuccessful = this.stats.successfulExtractions;
      this.stats.averageConfidence = 
        (this.stats.averageConfidence * (totalSuccessful - 1) + confidence) / totalSuccessful;
    } else {
      this.stats.failedExtractions++;
    }

    // Update average processing time
    const total = this.stats.totalProcessed;
    this.stats.averageProcessingTime = 
      (this.stats.averageProcessingTime * (total - 1) + processingTime) / total;
  }

  updateProviderStats(provider, success, processingTime, confidence = 0) {
    const stats = this.stats.providerUsage[provider];
    if (!stats) return;

    stats.requests++;
    
    if (success) {
      stats.successes++;
      
      // Update average confidence
      stats.avgConfidence = 
        (stats.avgConfidence * (stats.successes - 1) + confidence) / stats.successes;
    } else {
      stats.failures++;
    }

    // Update average processing time
    stats.avgProcessingTime = 
      (stats.avgProcessingTime * (stats.requests - 1) + processingTime) / stats.requests;
  }

  getStatistics() {
    return {
      ...this.stats,
      successRate: this.stats.totalProcessed > 0 
        ? this.stats.successfulExtractions / this.stats.totalProcessed 
        : 0,
      config: {
        providers: this.config.providers,
        primaryProvider: this.config.primaryProvider,
        confidenceThreshold: this.config.confidenceThreshold,
        fallbackEnabled: this.config.fallbackEnabled
      }
    };
  }

  async healthCheck() {
    const health = {
      status: 'healthy',
      providers: {}
    };

    // Check each provider
    for (const provider of this.config.providers) {
      try {
        await this.checkProviderHealth(provider);
        health.providers[provider] = { status: 'healthy' };
      } catch (error) {
        health.providers[provider] = { 
          status: 'unhealthy', 
          error: error.message 
        };
        health.status = 'degraded';
      }
    }

    return health;
  }

  async checkProviderHealth(provider) {
    switch (provider) {
      case 'google_vision':
        if (!this.providerConfigs.google_vision.apiKey) {
          throw new Error('Google Vision API key not configured');
        }
        break;
      case 'aws_textract':
        if (!this.textractClient) {
          throw new Error('AWS Textract not configured');
        }
        break;
      case 'tesseract':
        // Tesseract is always available if installed
        break;
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }
}

module.exports = OCRProcessingEngine;