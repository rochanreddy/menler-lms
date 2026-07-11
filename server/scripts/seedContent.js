// Seed real Menler curriculum into the Learning tree (Program → Module → Chapter
// → Topic), sourced from the marketing site's 8-week Generalist curriculum.
//   npm run seed:content
import 'dotenv/config';
import { connectDb } from '../db.js';
import { Program } from '../models/Program.js';

// Condensed from menler.in curriculumData (GENERALIST_WEEKS).
const WEEKS = [
  { wk: 'W1', stage: 'Understand AI', title: 'See the Landscape Clearly',
    topics: ['How LLMs work: tokens, parameters, RLHF', 'Context windows, embeddings, temperature', 'Claude vs ChatGPT vs Gemini — live', '6 Gen AI categories + why Claude leads'],
    tools: ['Claude', 'ChatGPT', 'Gemini', 'Perplexity', 'NotebookLM', 'Hugging Face'],
    assignment: 'My AI Landscape Report — 12 tools, 6 categories.', project: '', outcome: 'Clear mental model of AI. First Claude session done.' },
  { wk: 'W2', stage: 'Talk With AI', title: 'Claude Mastery',
    topics: ['Projects, Skills, Connectors, MCPs, APIs', 'System prompt architecture', 'Chat vs Cowork vs Code; Schedules, Plugins, Routines', 'Claude in PowerPoint, Word, Excel; Notion memory'],
    tools: ['Claude', 'Notion', 'Claude for Office'],
    assignment: 'Claude Workspace Setup — 3 Projects, Connector, prompts.', project: 'Project 1 — My Claude OS: configured workspace, live demo.', outcome: 'A personal Claude OS used daily from here on.' },
  { wk: 'W3', stage: 'Think With AI', title: 'Prompting Mastery',
    topics: ['16 frameworks: CoT, ToT, RAG, chaining & more', 'Skills as prompt libraries; Routines for chains', 'Meeting intel: Granola, Fireflies → Claude → Notion', 'Research: Perplexity → Claude → Gamma'],
    tools: ['Claude', 'Granola', 'Fireflies', 'Perplexity', 'NotebookLM', 'Gamma', 'Taskade'],
    assignment: 'AI Productivity Playbook — 8 prompts + 3 workflows.', project: '', outcome: 'Productivity system live. Prompt library built.' },
  { wk: 'W4', stage: 'Create With AI', title: 'AI Creative Studio',
    topics: ['Diffusion models + image prompt architecture', 'Gemini vs DALL-E vs Firefly vs Ideogram', 'AI video: Kling, Runway, Pika; voice from scratch', 'Blender 3D with Claude as navigator'],
    tools: ['Claude', 'Gemini', 'DALL-E 3', 'Firefly', 'Runway', 'Pika', 'ElevenLabs', 'Suno', 'Blender 3D', 'Canva'],
    assignment: 'AI Media Kit — 4 images, 1 video, 1 audio, 1 render.', project: 'Project 2 — AI Media Kit: full media package, gallery demo.', outcome: 'Portfolio-grade media kit across every modality.' },
  { wk: 'W5', stage: 'Automate With AI', title: 'Agents & Workflows',
    topics: ['Agent loop: Perception → Reasoning → Action → Memory', 'Routines (5-step chains) + Schedules', 'MCPs as tools: Notion, Slack, Gmail, Calendar', 'N8N, Make, Zapier with Claude as the brain'],
    tools: ['Claude', 'N8N', 'Make', 'Zapier', 'Notion', 'Airtable', 'Slack'],
    assignment: 'First Automated Pipeline — N8N + Routines + 3 MCP tools.', project: '', outcome: 'Live pipeline running without manual input.' },
  { wk: 'W6', stage: 'Scale With AI', title: 'Voice & Agents at Scale',
    topics: ['STT/TTS from scratch: Whisper, Deepgram, prosody', 'Voice cloning + ElevenLabs voice design', 'Voice agents: VAPI, Bland AI, Retell AI', 'Routines + MCPs inside live calls'],
    tools: ['Claude', 'ElevenLabs', 'Whisper', 'Deepgram', 'VAPI', 'Bland AI', 'Retell AI', 'N8N'],
    assignment: 'Automated AI System — automation + voice layer, autonomous.', project: 'Project 3 — Automated AI System: voice agent + automation, live trigger.', outcome: 'Live voice-capable system. STT→TTS→agent loop understood.' },
  { wk: 'W7', stage: 'Build With AI', title: 'Vibecoding & Apps',
    topics: ['Vibecoding: describe → generate → test → ship', 'Claude Code + CLAUDE.md + MCP to GitHub/Supabase', 'Cursor, Lovable, Bolt.new for full-stack apps', 'Agentic apps; Emergent + Replit deploy'],
    tools: ['Claude Code', 'Cursor', 'Lovable', 'Bolt.new', 'Replit', 'Emergent', 'Supabase', 'GitHub'],
    assignment: 'Capstone Scope Doc + MVP skeleton with first route.', project: '', outcome: 'At least 1 web app shipped. Capstone scaffolded.' },
  { wk: 'W8', stage: 'AI Native', title: 'Ship It — Demo Day',
    topics: ['Capstone build sprint on the full Claude stack', 'Product polish: UX, errors, MCP reliability', 'Gamma deck + 5-minute presentation coaching', 'Show Claude working; certification criteria'],
    tools: ['Claude', 'Gamma', 'Notion'],
    assignment: 'Capstone Product — Ship It. Live product + deck + demo.', project: 'Project 4 — Ship It: real product, Claude central. 5-min Demo Day.', outcome: 'Certified AI Generalist. 4 portfolio projects, live stack.' },
];

function buildModules() {
  return WEEKS.map((w, i) => ({
    title: `${w.wk} · ${w.title}`,
    order: i,
    chapters: [
      {
        title: `Lessons — ${w.stage}`,
        order: 0,
        topics: w.topics.map((t, ti) => ({ title: t, contentType: 'text', body: t, order: ti })),
      },
      {
        title: 'Practice & Outcome',
        order: 1,
        topics: [
          { title: 'Assignment', contentType: 'text', body: w.assignment, order: 0 },
          ...(w.project ? [{ title: 'Project', contentType: 'text', body: w.project, order: 1 }] : []),
          { title: 'Tools used', contentType: 'text', body: w.tools.join(' · '), order: 2 },
          { title: 'Outcome', contentType: 'text', body: w.outcome, order: 3 },
        ],
      },
    ],
  }));
}

async function run() {
  await connectDb();
  const modules = buildModules();
  // Apply to Kickstarter + Fellowship (create if missing).
  for (const title of ['Kickstarter', 'Fellowship']) {
    let program = await Program.findOne({ title });
    if (!program) program = await Program.create({ title, type: 'cohort', published: true });
    program.modules = modules;
    program.published = true;
    program.description = program.description || 'Menler 8-week AI Generalist curriculum.';
    await program.save();
    console.log(`✓ ${title}: ${modules.length} modules, ${modules.reduce((n, m) => n + m.chapters.reduce((c, ch) => c + ch.topics.length, 0), 0)} topics`);
  }
  console.log('\n✅ Learning content seeded.');
  process.exit(0);
}

run().catch((err) => { console.error('Content seed failed:', err); process.exit(1); });
