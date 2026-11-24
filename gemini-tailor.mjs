#!/usr/bin/env node
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'node:fs';
import path from 'node:path';
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
const dataRoot = getCareerOpsRoot();
const targetArg = process.argv[2] || "1";

// Find report
const reportsDir = path.join(dataRoot, "reports");
let reportContent = "";
let reportFile = "";

if (fs.existsSync(reportsDir)) {
  const files = fs.readdirSync(reportsDir).filter(f => f.endsWith(".md"));
  const match = files.find(f => f.startsWith(`${targetArg}-`) || f.startsWith(`0${targetArg}-`) || f.startsWith(`00${targetArg}-`)) || files[0];
  if (match) {
    reportFile = match;
    reportContent = fs.readFileSync(path.join(reportsDir, match), "utf8");
  }
}

// Read cv.md
const cvPath = path.join(dataRoot, "cv.md");
const cvText = fs.existsSync(cvPath) ? fs.readFileSync(cvPath, "utf8") : "";

if (!cvText) {
  console.error("cv.md not found in " + dataRoot);
  process.exit(1);
}

// Read profile.yml if available
let profileText = "";
const profilePath = path.join(dataRoot, "config", "profile.yml");
if (fs.existsSync(profilePath)) {
  profileText = fs.readFileSync(profilePath, "utf8");
}

const prompt = `You are an ATS CV tailoring expert. Tailor the candidate's CV for the target job role.
Ground truth source of facts (DO NOT INVENT ANY SKILL, TITLE, OR METRIC NOT IN cv.md):
"""
${cvText}
"""

Evaluation Report & Target Job Requirements:
"""
${reportContent || `Target Job Request: ${targetArg}`}
"""

Candidate Profile:
"""
${profileText}
"""

Follow these strict rules:
1. Reorder experience bullets to highlight relevance to the target job's keywords and skills.
2. In the Professional Summary, focus on the target role using facts from cv.md.
3. Keep Work Experience in reverse-chronological order (newest start date first).
4. Preserve exact company names, titles, and dates from cv.md.
5. In Core Competencies, select 6-8 relevant skills demonstrated in cv.md.
6. Pick the top projects from cv.md.
7. NEVER invent skills, degrees, or employers.
8. Output MUST BE valid JSON conforming to the modes/pdf.md JSON Input Schema.
9. Wrap the JSON in <<cv-json format="a4">> and <</cv-json>> on their own lines.
10. End with: VERDICT: 5/5 — Tailored CV created successfully

JSON format:
{
  "lang": "en",
  "page_format": "a4",
  "candidate": {
    "name": "Bhanuprasad L.",
    "title": "<Tailored Title matching role>",
    "phone": "+91 9948515012",
    "email": "bhanuprasad.0921@gmail.com",
    "linkedin": { "url": "https://linkedin.com/in/bhanuprasad", "display": "linkedin.com/in/bhanuprasad" },
    "github": { "url": "https://github.com/bhanurx100", "display": "github.com/bhanurx100" },
    "portfolio": { "url": "https://bhanuprasad.dev", "display": "bhanuprasad.dev" },
    "location": "Bengaluru, India"
  },
  "sections": {
    "summary": "Professional Summary",
    "competencies": "Core Competencies",
    "experience": "Work Experience",
    "projects": "Projects",
    "education": "Education",
    "skills": "Technical Skills"
  },
  "summary": "<2-4 sentences summary tailored to the role>",
  "competencies": ["<Skill 1>", "<Skill 2>", "<Skill 3>", "<Skill 4>", "<Skill 5>", "<Skill 6>"],
  "experience": [
    {
      "company": "Cynosure Software Solutions Pvt. Ltd.",
      "role": "Software Engineer (Full-Stack Development)",
      "location": "Remote",
      "dates": "Dec 2023 - Present",
      "bullets": [ ... ]
    }
  ],
  "projects": [
    {
      "name": "SplitFin",
      "type": "Personal Finance & Investment Platform",
      "bullets": [ ... ]
    },
    {
      "name": "StayEase",
      "type": "Stay Marketplace & Booking Platform",
      "bullets": [ ... ]
    }
  ],
  "education": [
    {
      "institution": "The National Institute of Engineering, Mysore",
      "degree": "B.E. in Information Science and Engineering",
      "year": "2019 - 2023"
    }
  ],
  "skills": [
    { "category": "Languages", "items": ["TypeScript", "JavaScript", "Python"] },
    { "category": "Frontend", "items": ["React", "Next.js", "Tailwind CSS"] },
    { "category": "Mobile", "items": ["React Native", "Expo", "Expo Router"] },
    { "category": "Backend", "items": ["Node.js", "Express.js", "REST APIs"] },
    { "category": "Databases", "items": ["PostgreSQL", "MongoDB", "Prisma"] }
  ]
}
`;

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
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      // Ensure envelope markers
      if (!text.includes("<<cv-json")) {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          process.stdout.write(`<<cv-json format="a4">\n${jsonMatch[0]}\n<</cv-json>>\n\nVERDICT: 5/5 — Tailored CV created successfully\n`);
          return;
        }
      }
      process.stdout.write(text + "\n");
      return;
    } catch (err) {
      if (modelName === candidateModels[candidateModels.length - 1]) {
        console.error(`Gemini CV tailoring failed: ${err.message}`);
        process.exit(1);
      }
    }
  }
}

run();
