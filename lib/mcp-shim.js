#!/usr/bin/env node

/**
 * MCP Proxy Shim - Production Version
 * 
 * A secure, production-ready MCP server shim that forwards local stdio-based
 * MCP requests to a remote MCP-Compose proxy.
 * 
 * Features:
 * - Robust error handling and graceful degradation
 * - Request rate limiting and timeout management
 * - Path sanitization for filesystem requests
 * - Cached responses for improved performance
 * - Detailed logging with rotation capability
 * - Retries with exponential backoff for network issues
 * - Support for HTTPS and authorization
 */

const fetch = require('node-fetch');
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const os = require('os');

// =============================================================================
// Configuration
// =============================================================================

// Core settings - configurable via environment variables
const CONFIG = {
  // Proxy connection settings
  proxyUrl: process.env.MCP_PROXY_URL || 'http://localhost:9876',
  serverName: process.env.MCP_SERVER_NAME || 'filesystem',
  apiKey: process.env.MCP_API_KEY || '',
  
  // Security settings
  maxRequestSize: parseInt(process.env.MCP_MAX_REQUEST_SIZE, 10) || 5 * 1024 * 1024, // 5MB
  rateLimitPerMinute: parseInt(process.env.MCP_RATE_LIMIT, 10) || 60,
  allowedPaths: (process.env.MCP_ALLOWED_PATHS || '').split(',').filter(Boolean),
  
  // Performance settings
  responseCache: process.env.MCP_CACHE !== 'false',
  cacheTTLMs: parseInt(process.env.MCP_CACHE_TTL_MS, 10) || 5 * 60 * 1000, // 5 minutes
  timeout: parseInt(process.env.MCP_TIMEOUT_MS, 10) || 30000, // 30 seconds
  
  // Retry settings
  maxRetries: parseInt(process.env.MCP_MAX_RETRIES, 10) || 3,
  retryInitialDelayMs: parseInt(process.env.MCP_RETRY_INITIAL_DELAY_MS, 10) || 100,
  retryMaxDelayMs: parseInt(process.env.MCP_RETRY_MAX_DELAY_MS, 10) || 5000,
  
  // Logging settings
  logLevel: process.env.MCP_LOG_LEVEL || 'info', // trace, debug, info, warn, error
  logToFile: process.env.MCP_LOG_FILE === 'true',
  logMaxSize: parseInt(process.env.MCP_LOG_MAX_SIZE, 10) || 10 * 1024 * 1024, // 10MB
  logFile: process.env.MCP_LOG_FILE_PATH || path.join(os.tmpdir(), `mcp-shim-${process.env.MCP_SERVER_NAME || 'unknown'}.log`),
};

// =============================================================================
// Logging System
// =============================================================================

const LOG_LEVELS = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
};

const logger = {
  logStream: CONFIG.logToFile ? fs.createWriteStream(CONFIG.logFile, { flags: 'a' }) : null,

  /**
   * Write a log entry
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} [data] - Optional data to include
   */
  log(level, message, data) {
    if (LOG_LEVELS[level] < LOG_LEVELS[CONFIG.logLevel]) {
      return;
    }
    
    const timestamp = new Date().toISOString();
    const logEntry = {
      time: timestamp,
      level,
      message,
      server: CONFIG.serverName,
      ...(data && { data }),
    };
    
    const logString = JSON.stringify(logEntry);
    
    // Log to stderr for debug visibility
    if (level === 'error' || level === 'warn' || CONFIG.logLevel === 'debug' || CONFIG.logLevel === 'trace') {
      console.error(`[${level.toUpperCase()}] ${message}`);
      if (data) {
        console.error(JSON.stringify(data, null, 2));
      }
    }
    
    // Log to file if enabled
    if (CONFIG.logToFile && this.logStream) {
      this.logStream.write(logString + '\n');
      
      // Rotate log if needed
      fs.stat(CONFIG.logFile, (err, stats) => {
        if (!err && stats.size > CONFIG.logMaxSize) {
          this.rotateLog();
        }
      });
    }
  },
  
  /**
   * Rotate the log file
   */
  rotateLog() {
    if (this.logStream) {
      this.logStream.end();
      
      const timestamp = new Date().toISOString().replace(/:/g, '-');
      const newLogFile = `${CONFIG.logFile}.${timestamp}`;
      
      fs.rename(CONFIG.logFile, newLogFile, (err) => {
        if (err) {
          console.error(`Failed to rotate log file: ${err.message}`);
        }
        this.logStream = fs.createWriteStream(CONFIG.logFile, { flags: 'a' });
      });
    }
  },
  
  /**
   * Log at trace level
   */
  trace(message, data) {
    this.log('trace', message, data);
  },
  
  /**
   * Log at debug level
   */
  debug(message, data) {
    this.log('debug', message, data);
  },
  
  /**
   * Log at info level
   */
  info(message, data) {
    this.log('info', message, data);
  },
  
  /**
   * Log at warn level
   */
  warn(message, data) {
    this.log('warn', message, data);
  },
  
  /**
   * Log at error level
   */
  error(message, data) {
    this.log('error', message, data);
  },
  
  /**
   * Close the log stream
   */
  close() {
    if (this.logStream) {
      this.logStream.end();
    }
  },
};

// =============================================================================
// Cache System
// =============================================================================

const cache = {
  entries: new Map(),
  
  /**
   * Get a cached entry if valid
   * @param {string} key - Cache key
   * @returns {Object|undefined} - Cached entry or undefined if not found or expired
   */
  get(key) {
    if (!CONFIG.responseCache) {
      return undefined;
    }
    
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }
    
    // Check if entry is expired
    if (Date.now() > entry.expiry) {
      this.entries.delete(key);
      return undefined;
    }
    
    logger.debug(`Cache hit for key: ${key}`);
    return entry.value;
  },
  
  /**
   * Set a cache entry
   * @param {string} key - Cache key
   * @param {Object} value - Value to cache
   */
  set(key, value) {
    if (!CONFIG.responseCache) {
      return;
    }
    
    this.entries.set(key, {
      value,
      expiry: Date.now() + CONFIG.cacheTTLMs,
    });
    
    logger.debug(`Cached response for key: ${key}`);
  },
  
  /**
   * Generate a cache key from a request
   * @param {Object} request - Request object
   * @returns {string} - Cache key
   */
  createKey(request) {
    // Don't cache stateful operations
    if (this.isUncacheable(request)) {
      return null;
    }
    
    return `${request.method}:${JSON.stringify(request.params)}`;
  },
  
  /**
   * Check if a request is cacheable
   * @param {Object} request - Request object
   * @returns {boolean} - True if uncacheable, false if cacheable
   */
  isUncacheable(request) {
    // Don't cache state-modifying operations
    const writeOperations = [
      'write_file', 'edit_file', 'create_directory', 'move_file', 'delete',
      'create_entities', 'delete_entities', 'create_relations', 'delete_relations',
      'add_observations', 'delete_observations',
    ];
    
    // Check if it's a tools call with a modifying operation
    if (request.method === 'tools/call' && 
        typeof request.params?.name === 'string') {
      return writeOperations.some(op => request.params.name.includes(op));
    }
    
    return false;
  }
};

// =============================================================================
// Rate Limiting
// =============================================================================

const rateLimit = {
  requests: [],
  
  /**
   * Check if the current request would exceed the rate limit
   * @returns {boolean} - True if rate limit is exceeded
   */
  isLimitExceeded() {
    const now = Date.now();
    
    // Remove requests older than 1 minute
    this.requests = this.requests.filter(time => now - time < 60000);
    
    // Check if we've exceeded the limit
    return this.requests.length >= CONFIG.rateLimitPerMinute;
  },
  
  /**
   * Record a new request
   */
  addRequest() {
    this.requests.push(Date.now());
  }
};

// =============================================================================
// Path Security
// =============================================================================

const pathSecurity = {
  /**
   * Sanitize a file path to prevent traversal attacks
   * @param {string} filePath - File path to sanitize
   * @returns {string|null} - Sanitized path or null if invalid
   */
  sanitizePath(filePath) {
    if (!filePath || typeof filePath !== 'string') {
      return null;
    }
    
    try {
      // Normalize the path to resolve .. and . segments
      const normalizedPath = path.normalize(filePath);
      
      // Check if this is an absolute path
      if (path.isAbsolute(normalizedPath)) {
        // Check if path is in allowed paths when they're specified
        if (CONFIG.allowedPaths.length > 0) {
          const isAllowed = CONFIG.allowedPaths.some(allowedPath => 
            normalizedPath === allowedPath || 
            normalizedPath.startsWith(allowedPath + path.sep)
          );
          
          if (!isAllowed) {
            logger.warn(`Access to path outside allowed directories: ${normalizedPath}`);
            return null;
          }
        }
        
        return normalizedPath;
      }
      
      // For relative paths, always return null as they're relative to unknown base
      logger.warn(`Rejected relative path: ${filePath}`);
      return null;
    } catch (error) {
      logger.error(`Path sanitization error: ${error.message}`, { path: filePath });
      return null;
    }
  },
  
  /**
   * Process filesystem-related requests to ensure path security
   * @param {Object} request - Request object
   * @returns {Object} - Modified request
   */
  processRequest(request) {
    // Skip if not a filesystem request
    if (CONFIG.serverName !== 'filesystem') {
      return request;
    }
    
    try {
      // For tools/call to filesystem
      if (request.method === 'tools/call' && 
          typeof request.params?.arguments === 'object') {
        
        const args = request.params.arguments;
        
        // Check for path parameter
        if (typeof args?.path === 'string') {
          const sanitizedPath = this.sanitizePath(args.path);
          if (sanitizedPath === null) {
            // Path was disallowed - return an error
            logger.warn(`Blocked access to path: ${args.path}`);
            return {
              ...request,
              // Add a flag so the forwarder knows to return an error 
              // instead of forwarding the request
              __securityViolation: true,
              __errorMessage: `Access denied to path: ${args.path}`
            };
          }
          
          args.path = sanitizedPath;
        }
        
        // Check for paths array parameter
        if (Array.isArray(args?.paths)) {
          const sanitizedPaths = [];
          let hasInvalidPath = false;
          
          for (const p of args.paths) {
            const sanitized = this.sanitizePath(p);
            if (sanitized === null) {
              hasInvalidPath = true;
              break;
            }
            sanitizedPaths.push(sanitized);
          }
          
          if (hasInvalidPath) {
            logger.warn(`Blocked access to one or more paths in: ${args.paths.join(', ')}`);
            return {
              ...request,
              __securityViolation: true,
              __errorMessage: `Access denied to one or more requested paths`
            };
          }
          
          args.paths = sanitizedPaths;
        }
        
        // Check for source/destination parameters
        if (typeof args?.source === 'string') {
          args.source = this.sanitizePath(args.source);
          if (args.source === null) {
            return {
              ...request,
              __securityViolation: true,
              __errorMessage: `Access denied to source path`
            };
          }
        }
        
        if (typeof args?.destination === 'string') {
          args.destination = this.sanitizePath(args.destination);
          if (args.destination === null) {
            return {
              ...request,
              __securityViolation: true,
              __errorMessage: `Access denied to destination path`
            };
          }
        }
      }
    } catch (error) {
      logger.error(`Error in path security processing: ${error.message}`, { request });
    }
    
    return request;
  }
};

// =============================================================================
// MCP Request Processing
// =============================================================================

/**
 * Forward an MCP request to the proxy
 * @param {Object} request - The MCP request to forward
 * @returns {Promise<Object>} - The response from the proxy
 */
async function forwardToProxy(request) {
  // Security checks
  if (request.__securityViolation) {
    return createErrorResponse(request.id, -32600, request.__errorMessage || "Security violation detected");
  }

  // Check request size
  const requestSize = Buffer.byteLength(JSON.stringify(request), 'utf8');
  if (requestSize > CONFIG.maxRequestSize) {
    logger.warn(`Request size (${requestSize} bytes) exceeds maximum (${CONFIG.maxRequestSize} bytes)`);
    return createErrorResponse(request.id, -32600, `Request too large (${requestSize} bytes)`);
  }
  
  // Rate limiting
  if (rateLimit.isLimitExceeded()) {
    logger.warn(`Rate limit exceeded: ${CONFIG.rateLimitPerMinute} requests per minute`);
    return createErrorResponse(request.id, -32029, "Rate limit exceeded");
  }
  
  // Record this request for rate limiting
  rateLimit.addRequest();
  
  // Check if we have a cached response
  const cacheKey = cache.createKey(request);
  if (cacheKey) {
    const cachedResponse = cache.get(cacheKey);
    if (cachedResponse) {
      // Ensure the cached response has the same ID as the request
      return { ...cachedResponse, id: request.id };
    }
  }
  
  const proxyUrl = `${CONFIG.proxyUrl}/${CONFIG.serverName}`;
  
  logger.debug(`Forwarding request to proxy: ${proxyUrl}`, { 
    method: request.method,
    id: request.id
  });
  
  const headers = {
    'Content-Type': 'application/json',
  };
  
  if (CONFIG.apiKey) {
    headers['Authorization'] = `Bearer ${CONFIG.apiKey}`;
  }
  
  // Retry logic with exponential backoff
  let lastError = null;
  for (let attempt = 0; attempt <= CONFIG.maxRetries; attempt++) {
    try {
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONFIG.timeout);
      
      const response = await fetch(proxyUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(request),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error ${response.status}: ${errorText}`);
      }
      
      const responseData = await response.json();
      
      logger.debug(`Response from proxy:`, {
        id: responseData.id,
        status: responseData.error ? 'error' : 'success',
        error: responseData.error
      });
      
      // Cache successful responses
      if (!responseData.error && cacheKey) {
        cache.set(cacheKey, responseData);
      }
      
      return responseData;
    } catch (error) {
      lastError = error;
      
      // Don't retry if we explicitly aborted due to timeout
      if (error.name === 'AbortError') {
        logger.error(`Request timed out after ${CONFIG.timeout}ms`);
        return createErrorResponse(request.id, -32000, `Request timed out after ${CONFIG.timeout}ms`);
      }
      
      // Don't retry if this was the last attempt
      if (attempt >= CONFIG.maxRetries) {
        break;
      }
      
      // Calculate backoff delay with jitter
      const delay = Math.min(
        CONFIG.retryMaxDelayMs,
        CONFIG.retryInitialDelayMs * Math.pow(2, attempt) * (0.9 + Math.random() * 0.2)
      );
      
      logger.warn(`Request failed (attempt ${attempt + 1}/${CONFIG.maxRetries + 1}). Retrying in ${Math.round(delay)}ms`, { 
        error: lastError.message 
      });
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  logger.error(`Request failed after ${CONFIG.maxRetries + 1} attempts:`, { 
    error: lastError?.message,
    url: proxyUrl
  });
  
  // Return error response
  return createErrorResponse(
    request.id, 
    -32003, 
    `Failed to communicate with MCP proxy: ${lastError?.message || "Unknown error"}`
  );
}

/**
 * Create a standardized error response
 * @param {number|string} id - Request ID
 * @param {number} code - Error code
 * @param {string} message - Error message
 * @returns {Object} - Error response
 */
function createErrorResponse(id, code, message) {
  return {
    jsonrpc: "2.0",
    id: id,
    error: {
      code: code,
      message: message
    }
  };
}

// =============================================================================
// Runtime Initialization
// =============================================================================

// Create readline interface for stdio communication
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

// Log startup information
logger.info(`MCP Shim started`, {
  serverName: CONFIG.serverName,
  proxyUrl: CONFIG.proxyUrl,
  pid: process.pid,
  nodeVersion: process.version
});

// Sanitize allowed paths
if (CONFIG.allowedPaths.length > 0) {
  CONFIG.allowedPaths = CONFIG.allowedPaths.map(p => path.normalize(p));
  logger.info(`Allowed paths configured`, { paths: CONFIG.allowedPaths });
}

// Process each line of input as a JSON-RPC request
rl.on('line', async (line) => {
  try {
    logger.debug(`Received request: ${line.length > 1000 ? line.substring(0, 1000) + '...' : line}`);
    
    // Check line length as a basic security measure
    if (line.length > CONFIG.maxRequestSize) {
      logger.warn(`Request line too large (${line.length} bytes)`);
      console.log(JSON.stringify(createErrorResponse(null, -32600, "Request too large")));
      return;
    }
    
    // Parse the request
    const request = JSON.parse(line);
    
    // Process paths for security if it's a filesystem server
    const secureRequest = pathSecurity.processRequest(request);
    
    // Forward to the proxy
    const response = await forwardToProxy(secureRequest);
    
    // Send the response back
    console.log(JSON.stringify(response));
  } catch (error) {
    logger.error(`Error processing request: ${error.message}`);
    
    // Return a standard JSON-RPC parse error
    console.log(JSON.stringify({
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32700,
        message: `Parse error: ${error.message}`
      }
    }));
  }
});

// Handle process termination
function handleShutdown() {
  logger.info(`MCP Shim shutting down`);
  logger.close();
  rl.close();
  process.exit(0);
}

// Set up signal handlers for graceful shutdown
process.on('SIGTERM', handleShutdown);
process.on('SIGINT', handleShutdown);

// Handle unhandled errors
process.on('uncaughtException', (error) => {
  logger.error(`Uncaught exception: ${error.message}`, { 
    stack: error.stack, 
    name: error.name
  });
  
  // For critical errors, exit after logging
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error(`Unhandled rejection at: ${promise}, reason: ${reason}`);
});
