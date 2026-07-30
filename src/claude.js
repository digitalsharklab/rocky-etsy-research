// Claude API wrapper for R.O.C.K.Y.
// Uses the official Anthropic SDK. Model is configurable via CLAUDE_MODEL.

const Anthropic = require('@anthropic-ai/sdk');

const DEFAULT_MODEL = 'claude-opus-5';
const MODEL = process.env.CLAUDE_MODEL || DEFAULT_MODEL;

// Server-side refusal fallbacks are only supported on the Opus 5 / Fable 5 tier.
const FALLBACK_CAPABLE = new Set(['claude-opus-5', 'claude-fable-5']);

let client = null;
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

function isConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function extractText(response) {
  return response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

/**
 * Single entry point for Messages API calls.
 * Throws Error with .status / .code set for the HTTP layer to map.
 */
async function createMessage({ system, messages, maxTokens = 2048, outputFormat }) {
  if (!isConfigured()) {
    const err = new Error('ANTHROPIC_API_KEY is not configured on the server');
    err.status = 503;
    throw err;
  }

  const params = { model: MODEL, max_tokens: maxTokens, system, messages };
  if (outputFormat) params.output_config = { format: outputFormat };

  let response;
  try {
    if (FALLBACK_CAPABLE.has(MODEL)) {
      // On a safety-classifier decline the API transparently re-runs the
      // request on Anthropic's recommended fallback model.
      response = await getClient().beta.messages.create({
        ...params,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      });
    } else {
      response = await getClient().messages.create(params);
    }
  } catch (error) {
    throw mapSdkError(error);
  }

  if (response.stop_reason === 'refusal') {
    const err = new Error('Claude declined to answer this request');
    err.status = 422;
    err.code = 'refusal';
    throw err;
  }

  return {
    text: extractText(response),
    model: response.model,
    stopReason: response.stop_reason,
    usage: response.usage,
  };
}

function mapSdkError(error) {
  if (error instanceof Anthropic.AuthenticationError) {
    const err = new Error('Invalid Anthropic API key');
    err.status = 503;
    return err;
  }
  if (error instanceof Anthropic.RateLimitError) {
    const err = new Error('Claude API rate limit reached, try again in a moment');
    err.status = 429;
    return err;
  }
  if (error instanceof Anthropic.APIConnectionError) {
    const err = new Error('Could not reach the Claude API');
    err.status = 502;
    return err;
  }
  if (error instanceof Anthropic.APIError) {
    const err = new Error(`Claude API error: ${error.message}`);
    err.status = error.status >= 500 ? 502 : 500;
    return err;
  }
  return error;
}

module.exports = { createMessage, isConfigured, MODEL };
