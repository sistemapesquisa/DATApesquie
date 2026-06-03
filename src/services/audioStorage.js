const { performance } = require('perf_hooks');
const jsonLogger = require('../infrastructure/logger/jsonLogger');

class AudioStorageCircuitBreaker {
  constructor(name, failureThreshold = 3, cooldownMs = 12000) {
    this.name = name;
    this.failureThreshold = failureThreshold;
    this.cooldownMs = cooldownMs;
    this.state = 'CLOSED'; // 'CLOSED', 'OPEN', 'HALF_OPEN'
    this.failureCount = 0;
    this.nextAttemptTime = 0;
  }

  canRequest() {
    const now = Date.now();
    if (this.state === 'OPEN') {
      if (now >= this.nextAttemptTime) {
        this.state = 'HALF_OPEN';
        jsonLogger.warn(`Circuit Breaker [${this.name}] entering HALF_OPEN. Retesting audio upload.`);
        return true;
      }
      return false;
    }
    return true;
  }

  recordSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  recordFailure() {
    this.failureCount++;
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttemptTime = Date.now() + this.cooldownMs;
      jsonLogger.error(`Circuit Breaker [${this.name}] tripped to OPEN. Restricting audio uploads.`);
    }
  }
}

const audioBreaker = new AudioStorageCircuitBreaker('ExternalAudioStorage', 3, 10000);

/**
 * Simulates uploading audio interview recording to external media server.
 * Implements: Explicit Timeout, Retries, Circuit Breaker, and Latency Logging.
 * 
 * @param {string} interviewId 
 * @param {string} audioFileName 
 * @returns {Promise<{ success: boolean, audioUrl: string }>}
 */
async function uploadAudioMock(interviewId, audioFileName) {
  if (!audioBreaker.canRequest()) {
    jsonLogger.warn(`Audio storage circuit breaker is OPEN. Upload bypassed for interview [${interviewId}].`);
    return { success: false, reason: 'circuit_breaker_open' };
  }

  const maxRetries = 2;
  const timeoutMs = 1500; // 1.5 second timeout

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const start = performance.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      jsonLogger.info(`Uploading audio file '${audioFileName}' for interview [${interviewId}] (Attempt ${attempt + 1}/${maxRetries + 1})...`);
      
      // Simulate network request
      await new Promise((resolve) => setTimeout(resolve, 100)); // 100ms latency
      
      // Success criteria
      const uploadSuccess = true; 
      if (!uploadSuccess) {
        throw new Error('Simulated media server error');
      }

      const latencyMs = performance.now() - start;
      clearTimeout(timeoutId);

      jsonLogger.info('Interview audio uploaded successfully to external storage', {
        interviewId,
        audioFileName,
        latencyMs: latencyMs.toFixed(2)
      });

      audioBreaker.recordSuccess();
      return {
        success: true,
        audioUrl: `/audio-vault/${audioFileName}` // Simulated storage URL
      };

    } catch (err) {
      clearTimeout(timeoutId);
      const latencyMs = performance.now() - start;
      
      jsonLogger.error('Audio upload attempt failed', {
        interviewId,
        attempt: attempt + 1,
        latencyMs: latencyMs.toFixed(2),
        error: err.message
      });

      if (attempt < maxRetries) {
        // Backoff delay
        const backoffDelay = 100 * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      } else {
        audioBreaker.recordFailure();
      }
    }
  }

  return { success: false, reason: 'upload_failed' };
}

module.exports = {
  uploadAudioMock,
  audioBreaker
};
