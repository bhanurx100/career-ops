#!/usr/bin/env node
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCareerOpsRoot } from './path-resolver.mjs';

try {
  const dns = await import('node:dns');
  dns.setDefaultResultOrder?.('ipv4first');
} catch {}

try {
  const { config } = await import('dotenv');
  config({ path: [path.join(getCareerOpsRoot(), '.env'), path.join(process.cwd(), '.env')], override: true });
} catch {}

let apiKey = (process.env.GEMINI_API_KEY || '').trim();
if (apiKey) {
  apiKey = apiKey.replace(/^['"`](.*)['"`]$/, '$1').replace(/^X-goog-api-key:\s*/i, '').trim();
}
if (!apiKey) {
  console.error("GEMINI_API_KEY is not set in .env");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

async function getPrompt() {
  const args = process.argv.slice(2);
  if (args.length > 0) {
    // If the first arg is a file path that exists, read the prompt from the file
    if (args.length === 1 && fs.existsSync(args[0])) {
      try {
        return fs.readFileSync(args[0], 'utf8').trim();
      } catch {}
    }
    return args.join(' ').trim();
  }
  // Otherwise read from stdin
  if (!process.stdin.isTTY) {
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf8').trim();
  }
  return '';
}

const prompt = await getPrompt();
if (!prompt) {
  console.error("No prompt provided");
  process.exit(1);
}

const userModel = process.env.GEMINI_MODEL ? process.env.GEMINI_MODEL.trim().replace(/^['"`](.*)['"`]$/, '$1').trim() : undefined;
const candidateModels = [
  userModel,
  'gemini-3.8-flash',
  'gemini-3-flash-preview',
  'gemini-3.8-flash-preview',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-flash-latest',
  'gemini-2.5-flash',
  'gemini-1.5-flash',
  'gemini-2.0-flash',
  'gemini-pro-latest',
  'gemini-2.5-pro',
].filter(Boolean);

async function run() {
  for (const modelName of candidateModels) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContentStream(prompt);
      for await (const chunk of result.stream) {
        process.stdout.write(chunk.text());
      }
      return;
    } catch (err) {
      if (modelName === candidateModels[candidateModels.length - 1]) {
        console.error(`Gemini call failed: ${err.message}`);
        process.exit(1);
      }
    }
  }
}

run();
