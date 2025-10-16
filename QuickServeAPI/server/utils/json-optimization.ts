/**
 * FinBot v4 - JSON Optimization Utilities
 * Optimized JSON serialization and parsing
 */

import { Transform } from 'stream';

/**
 * Fast JSON stringify with optimizations
 */
export class FastJSON {
  private static dateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
  
  /**
   * Optimized JSON stringify
   */
  static stringify(obj: any, options: {
    space?: number;
    replacer?: (key: string, value: any) => any;
    skipNulls?: boolean;
    skipUndefined?: boolean;
  } = {}): string {
    const { space, replacer, skipNulls = false, skipUndefined = true } = options;
    
    const customReplacer = (key: string, value: any) => {
      // Skip undefined values
      if (skipUndefined && value === undefined) {
        return undefined;
      }
      
      // Skip null values if requested
      if (skipNulls && value === null) {
        return undefined;
      }
      
      // Optimize date serialization
      if (value instanceof Date) {
        return value.toISOString();
      }
      
      // Apply custom replacer if provided
      if (replacer) {
        value = replacer(key, value);
      }
      
      return value;
    };
    
    return JSON.stringify(obj, customReplacer, space);
  }
  
  /**
   * Optimized JSON parse with date parsing
   */
  static parse(str: string, options: {
    reviver?: (key: string, value: any) => any;
    parseDates?: boolean;
  } = {}): any {
    const { reviver, parseDates = true } = options;
    
    const customReviver = (key: string, value: any) => {
      // Parse ISO date strings back to Date objects
      if (parseDates && typeof value === 'string' && this.dateRegex.test(value)) {
        return new Date(value);
      }
      
      // Apply custom reviver if provided
      if (reviver) {
        value = reviver(key, value);
      }
      
      return value;
    };
    
    return JSON.parse(str, customReviver);
  }
  
  /**
   * Streaming JSON stringify for large objects
   */
  static createStringifyStream(options: {
    space?: number;
    skipNulls?: boolean;
    skipUndefined?: boolean;
  } = {}): Transform {
    const { space, skipNulls = false, skipUndefined = true } = options;
    let isFirst = true;
    
    return new Transform({
      objectMode: true,
      transform(chunk: any, encoding, callback) {
        try {
          let json: string;
          
          if (Array.isArray(chunk)) {
            // Handle array chunks
            json = chunk.map(item => 
              FastJSON.stringify(item, { space, skipNulls, skipUndefined })
            ).join(',');
            
            if (!isFirst) {
              json = ',' + json;
            }
          } else {
            // Handle object chunks
            json = FastJSON.stringify(chunk, { space, skipNulls, skipUndefined });
            
            if (!isFirst) {
              json = ',' + json;
            }
          }
          
          isFirst = false;
          callback(null, json);
        } catch (error) {
          callback(error);
        }
      }
    });
  }
}

/**
 * JSON response optimization middleware
 */
export const optimizeJsonResponse = () => {
  return (req: any, res: any, next: any) => {
    const originalJson = res.json.bind(res);
    
    res.json = function(obj: any) {
      // Set optimized headers
      this.setHeader('Content-Type', 'application/json; charset=utf-8');
      
      // Use optimized JSON stringify
      const jsonString = FastJSON.stringify(obj, {
        skipUndefined: true,
        skipNulls: false
      });
      
      // Add JSON size header for monitoring
      this.setHeader('X-JSON-Size', jsonString.length.toString());
      
      return this.send(jsonString);
    };
    
    next();
  };
};

/**
 * JSON schema validation and optimization
 */
export class JSONSchemaOptimizer {
  private schemas = new Map<string, any>();
  
  /**
   * Register schema for optimization
   */
  registerSchema(name: string, schema: any) {
    this.schemas.set(name, schema);
  }
  
  /**
   * Optimize object based on schema
   */
  optimize(obj: any, schemaName: string): any {
    const schema = this.schemas.get(schemaName);
    if (!schema) return obj;
    
    return this.optimizeBySchema(obj, schema);
  }
  
  private optimizeBySchema(obj: any, schema: any): any {
    if (!obj || typeof obj !== 'object') return obj;
    
    const optimized: any = {};
    
    // Only include properties defined in schema
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (obj.hasOwnProperty(key)) {
          const value = obj[key];
          
          // Recursively optimize nested objects
          if (propSchema && typeof propSchema === 'object' && propSchema.type === 'object') {
            optimized[key] = this.optimizeBySchema(value, propSchema);
          } else if (propSchema && typeof propSchema === 'object' && propSchema.type === 'array') {
            optimized[key] = Array.isArray(value) 
              ? value.map(item => this.optimizeBySchema(item, propSchema.items))
              : value;
          } else {
            optimized[key] = value;
          }
        }
      }
    }
    
    return optimized;
  }
}

/**
 * JSON minification utilities
 */
export class JSONMinifier {
  /**
   * Remove unnecessary whitespace and formatting
   */
  static minify(jsonString: string): string {
    try {
      const obj = JSON.parse(jsonString);
      return JSON.stringify(obj);
    } catch (error) {
      return jsonString; // Return original if parsing fails
    }
  }
  
  /**
   * Remove empty objects and arrays
   */
  static removeEmpty(obj: any): any {
    if (Array.isArray(obj)) {
      const filtered = obj
        .map(item => this.removeEmpty(item))
        .filter(item => {
          if (Array.isArray(item)) return item.length > 0;
          if (typeof item === 'object' && item !== null) {
            return Object.keys(item).length > 0;
          }
          return item !== null && item !== undefined;
        });
      
      return filtered;
    }
    
    if (typeof obj === 'object' && obj !== null) {
      const cleaned: any = {};
      
      for (const [key, value] of Object.entries(obj)) {
        const cleanedValue = this.removeEmpty(value);
        
        if (cleanedValue !== null && cleanedValue !== undefined) {
          if (Array.isArray(cleanedValue) && cleanedValue.length === 0) continue;
          if (typeof cleanedValue === 'object' && Object.keys(cleanedValue).length === 0) continue;
          
          cleaned[key] = cleanedValue;
        }
      }
      
      return cleaned;
    }
    
    return obj;
  }
  
  /**
   * Compress object keys (for repeated structures)
   */
  static compressKeys(obj: any, keyMap?: Map<string, string>): { 
    compressed: any; 
    keyMap: Map<string, string> 
  } {
    if (!keyMap) {
      keyMap = new Map();
    }
    
    let keyCounter = 0;
    
    const compress = (item: any): any => {
      if (Array.isArray(item)) {
        return item.map(compress);
      }
      
      if (typeof item === 'object' && item !== null) {
        const compressed: any = {};
        
        for (const [key, value] of Object.entries(item)) {
          let compressedKey = keyMap!.get(key);
          
          if (!compressedKey) {
            compressedKey = `k${keyCounter++}`;
            keyMap!.set(key, compressedKey);
          }
          
          compressed[compressedKey] = compress(value);
        }
        
        return compressed;
      }
      
      return item;
    };
    
    return {
      compressed: compress(obj),
      keyMap
    };
  }
  
  /**
   * Decompress object keys
   */
  static decompressKeys(obj: any, keyMap: Map<string, string>): any {
    const reverseMap = new Map();
    for (const [original, compressed] of keyMap.entries()) {
      reverseMap.set(compressed, original);
    }
    
    const decompress = (item: any): any => {
      if (Array.isArray(item)) {
        return item.map(decompress);
      }
      
      if (typeof item === 'object' && item !== null) {
        const decompressed: any = {};
        
        for (const [key, value] of Object.entries(item)) {
          const originalKey = reverseMap.get(key) || key;
          decompressed[originalKey] = decompress(value);
        }
        
        return decompressed;
      }
      
      return item;
    };
    
    return decompress(obj);
  }
}

/**
 * JSON streaming utilities for large responses
 */
export class JSONStreamer {
  /**
   * Stream large array responses
   */
  static streamArray(res: any, data: any[], options: {
    chunkSize?: number;
    transform?: (item: any) => any;
  } = {}) {
    const { chunkSize = 100, transform } = options;
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Transfer-Encoding', 'chunked');
    
    res.write('[');
    
    let isFirst = true;
    
    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, i + chunkSize);
      const processedChunk = transform ? chunk.map(transform) : chunk;
      
      const jsonChunk = processedChunk.map(item => JSON.stringify(item)).join(',');
      
      if (!isFirst) {
        res.write(',');
      }
      
      res.write(jsonChunk);
      isFirst = false;
    }
    
    res.write(']');
    res.end();
  }
  
  /**
   * Stream object with progress updates
   */
  static streamWithProgress(res: any, data: any, options: {
    onProgress?: (progress: number) => void;
  } = {}) {
    const { onProgress } = options;
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('X-Stream-Type', 'progressive');
    
    const jsonString = JSON.stringify(data);
    const chunkSize = 1024; // 1KB chunks
    
    for (let i = 0; i < jsonString.length; i += chunkSize) {
      const chunk = jsonString.slice(i, i + chunkSize);
      res.write(chunk);
      
      if (onProgress) {
        const progress = Math.min(100, (i + chunkSize) / jsonString.length * 100);
        onProgress(progress);
      }
    }
    
    res.end();
  }
}