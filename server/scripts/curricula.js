// The two real Menler curricula, transcribed from the official PDFs:
//   · Menler_AI_Kickstarter_Curriculum_Index.pdf  (4 sessions · 19 topics · 4 projects)
//   · Menler_Fellowship_Curriculum_6w.pdf         (6 weeks · 12 sessions · 4 milestones)
//
// This is the SINGLE SOURCE OF TRUTH for curriculum copy. seedContent.js authors
// it into the Learning tree; seedFull.js builds its fixture cohort on top of it.
// Neither script may carry its own lesson text — if the PDFs change, they change
// here and both seeds follow.
//
// Programme → Module → Chapter → Topic, matching models/Program.js.

// ── AI Kickstarter ───────────────────────────────────────────────────────────
// Each session → Module. Each topic → Chapter. Within a chapter: a "What's
// covered" topic + the topic's Assignment (+ its Project where one is attached).
export const KICKSTARTER_SESSIONS = [
  {
    session: 'S01 · AI Foundations + Claude OS',
    topics: [
      {
        code: '1.1', time: '35 min', title: 'The AI Landscape, What You Actually Need to Know',
        covered: [
          'AI vs Machine Learning vs Generative AI, the 3-level distinction',
          'What is an LLM? The simple mental model: autocomplete at civilisation scale',
          'Tokens, context windows, and why they determine what Claude can and cannot do',
          'Hallucinations: what causes them, how to detect them, when to trust the output',
          'AI limitations that matter: no real-time data, no memory across sessions (default), no judgement',
          'Why 2024–26 is the operator moment: tools are ready, most people are not using them well',
        ],
        assignment: { name: 'AI Audit, Where Does AI Already Touch Your Life?', body: '1. List 10 tools/products you use daily; mark which use AI.\n2. Pick one, read how it works, write 3 sentences in plain language.\n3. Ask Claude to explain how it works to someone who has never heard of an LLM; critique the answer.\n4. Find one public LLM hallucination, screenshot it, note why it happened.\nSubmit: Discord post, 3 bullets + 1 screenshot, under 100 words.' },
      },
      {
        code: '1.2', time: '25 min', title: 'Claude OS, Three Interfaces, Three Use Cases',
        covered: [
          'Claude Chat: conversational reasoning, analysis, writing, long-context Q&A',
          'Claude Cowork: persistent workspace, collaboration mode, shared context across tasks',
          'Claude Code: code generation, debugging, vibe coding, technical workflows',
          'Claude Artifacts: live documents, code snippets, SVGs, outputs you can use directly',
          'Claude Projects: memory, custom instructions, uploaded knowledge, persistent AI context',
          'When to use which interface, the decision tree every operator needs',
        ],
        assignment: { name: 'Interface Comparison Drill', body: 'Take one real task. Run it through Claude Chat (screenshot), then Claude Cowork (screenshot). Write a 3-sentence comparison: which gave better results and why. Bonus: identify your default interface.\nSubmit: Claude Artifact, 1 page, 3 screenshots embedded.' },
      },
      {
        code: '1.3', time: '25 min', title: 'Prompting Fundamentals, The CLEAR Framework',
        covered: [
          'Why vague prompts produce vague outputs, the garbage-in rule',
          'The CLEAR framework: Context · Length · Examples · Audience · Result',
          'Role prompting: when it works and when it does not',
          'Constraints as quality levers: word limits, format instructions, tone directives',
          'Chain prompting: breaking complex tasks into sequential steps',
          'Iterative refinement: treating Claude as a collaborator, not a one-shot machine',
          'What NOT to do: over-prompting, under-specifying, prompt injection risks',
        ],
        assignment: { name: 'Prompt Rewrite Battle + Personal Prompt Library', body: 'Take 5 prompts; rewrite each using CLEAR; show before/after. Run both versions for 2 prompts; compare outputs. Build a Prompt Cheat Sheet: 10+ prompts organised by category (writing, research, analysis, planning, coding).\nSubmit: Claude Artifact, Prompt Cheat Sheet. Becomes a portfolio asset.' },
      },
      {
        code: '1.4', time: '20 min', title: 'AI Workflow Thinking, From Task to System',
        covered: [
          'What is an AI workflow? Input → Process → Output → Action',
          'Mapping your work into AI-ready tasks: what can be delegated, what cannot',
          'Workflow thinking vs tool thinking: systems over individual prompts',
          'The 3-task method: pick 3 recurring tasks and redesign each with Claude at the centre',
          'Documenting your workflow as a reusable Artifact, the first step to a portfolio',
        ],
        assignment: { name: 'AI Workflow Map, Session 01 Deliverable', body: 'Identify 3 recurring tasks. For each: write the current process, then redesign with Claude in the loop. Map visually: Input → Claude step → Output → Action. Estimate weekly time saved. Post to Discord and get 2 peer comments before Session 02.\nSubmit: Claude Artifact, 1-page workflow map.' },
      },
    ],
  },
  {
    session: 'S02 · Claude Power Layer: Skills, Connectors, Intelligence & Creatives',
    topics: [
      {
        code: '2.1', time: '35 min', title: 'Claude Skills, Teaching Claude to Behave Differently',
        covered: [
          'What are Claude Skills? Custom instruction sets that change how Claude responds',
          'Built-in skills vs user-defined skills, the difference in practice',
          'Writing skill instructions: format, tone, domain and output-structure rules',
          'Stacking skills inside a Claude Project: how multiple skills interact',
          'Use case: a skill that always formats output as a Notion-ready document',
          'Use case: a skill that responds only with actionable bullet points, no preamble',
        ],
        assignment: { name: 'Build Your First Custom Skill', body: 'Identify one output type you produce often. Write a Skill instruction set: 5–8 rules defining format and style. Test it, screenshot before/after (skill active). Run 3 inputs; refine until consistent. Add to your Claude Project.\nSubmit: skill instructions + 2 before/after screenshots (#prompt-library). Feeds into Project 01.' },
      },
      {
        code: '2.2', time: '40 min', title: 'Claude Connectors, Claude Inside Your Existing Tools',
        covered: [
          'What are Claude Connectors? Native integrations that give Claude access to your data',
          'Google Drive Connector: ask Claude about files without copy-pasting',
          'Gmail Connector: draft replies, summarise threads, flag priority emails',
          'Notion Connector: query notes, summarise pages, build from your knowledge base',
          'How Connectors change output quality, context beats prompting alone',
          'Privacy and permissions: what Claude can access, what it cannot, how to control it',
          'Connector vs API: when you need a Connector and when you need to build something',
        ],
        assignment: { name: 'One Connector, One Real Task', body: 'Connect Claude to one tool you already use. Give it a task that requires reading from that source, no copy-paste. Document the task, prompt and output. Write one sentence: "Before Connectors this took ___ minutes. Now ___."\nSubmit: 1 screenshot + 1-sentence time comparison. Feeds into Project 01.' },
      },
      {
        code: '2.3', time: '45 min', title: 'Claude Projects, Building a Persistent Intelligence System',
        covered: [
          'Projects vs conversations: why session memory changes everything',
          'Project architecture: system prompt + skills + knowledge docs + connector access',
          'Writing an effective Project system prompt: persona, context, constraints, output rules',
          'Uploading knowledge documents: your own notes, SOPs, research, company context',
          'Project personas: "You are my senior research analyst who knows my domain"',
          'Managing multiple Projects: one per role, domain, or workflow context',
          'Projects as the foundation for automation: Sessions 03 and 04 build on top of this',
        ],
        assignment: { name: 'Connected Claude Workspace, Session 02 Deliverable', body: 'Create a Claude Project. Write a system prompt (150+ words). Add one Skill (2.1). Upload one knowledge document. Connect one Connector (2.2). Run 3 real tasks; document results.\nSubmit: Claude Artifact, Project Setup Summary.' },
        project: { name: 'PROJECT 01: Personal AI Operating System', body: 'A fully configured Claude workspace personalised to your role, domain and recurring tasks. Must complete 3 of your real weekly tasks without switching apps or copy-pasting.' },
      },
      {
        code: '2.4', time: '55 min', title: 'Research Intelligence, Claude + Perplexity + NotebookLM',
        covered: [
          'The research stack: why one tool is never enough',
          'Perplexity AI: real-time web research with citations, when to use it over Claude',
          'NotebookLM: uploading source documents and interrogating them directly',
          'Claude as the synthesis layer: Perplexity findings + NotebookLM extracts → insight',
          'The pipeline: Question → Perplexity → NotebookLM → Claude (synthesis + output)',
          'Evaluating AI research output: cross-referencing, spotting gaps, adding human judgement',
          'Building a research brief in under 30 minutes using the full stack',
        ],
        assignment: { name: 'Research Intelligence Pipeline', body: 'Pick a topic. Step 1, Perplexity: 3 queries, screenshot top 3 results with citations. Step 2, NotebookLM: upload 2 documents, ask 5 questions. Step 3, Claude: synthesise into a 300-word insight brief with 3 recommendations. Evaluate what AI got right vs what needed judgement.\nSubmit: Claude Artifact, 1-page Research Brief with source trail. Feeds into Project 02.' },
      },
      {
        code: '2.5', time: '50 min', title: 'AI Creatives, Image, Audio & Video Generation',
        covered: [
          'How diffusion models work: diffusion in plain language, no maths required',
          'Prompt engineering for visuals: subject, style, lighting, composition, aspect ratio, negative prompts',
          'Midjourney vs DALL-E 3 vs Adobe Firefly vs Ideogram, when to use which',
          'Using Claude to write better image prompts: intent → Claude prompt → image tool',
          'AI audio: voice cloning with ElevenLabs, TTS, podcast and narration workflows',
          'AI video: Runway Gen-3 and Sora for short-form, Pictory for text-to-video',
          'Canva AI and Adobe Firefly inside tools professionals already use',
          'Copyright, ownership, and ethical use of AI-generated creative output',
        ],
        assignment: { name: 'Build a Creative Asset Set', body: 'Choose a real brief (social post, podcast intro, product banner, explainer). Image: Claude writes prompt → Midjourney/DALL-E 3, iterate 3×. Audio: ElevenLabs 30-sec narration from a Claude script. Combine in Canva AI or Gamma. Reflect on where AI delivered vs where you directed it.\nSubmit: final creative asset + the Claude prompt used for each step.' },
      },
    ],
  },
  {
    session: 'S03 · Schedules, Routines, Workflows & Automation Systems',
    topics: [
      {
        code: '3.1', time: '40 min', title: 'Claude Schedules, Time-Triggered Intelligence',
        covered: [
          'What is a Claude Schedule? Time-triggered prompts that run automatically',
          'Schedule anatomy: trigger time + prompt + output destination',
          'Use case: daily morning brief, news digest, calendar summary, priority 3 tasks',
          'Use case: weekly review digest, what happened, what is next, what to decide',
          'Use case: automated report runner, pull data context, generate summary, send',
          'How to write a Schedule prompt: self-contained, context-rich, output-specific',
          'Limitations: what Schedules cannot do without a Connector feeding live data',
        ],
        assignment: { name: 'Build and Run Your Morning Brief Schedule', body: 'Design a Morning Brief Schedule for your context. Write the prompt (what you want each morning, format, what you will do with it). Run it 3 consecutive days. After Day 1: score /10 and edit. After Day 3: write a 3-sentence reflection.\nSubmit: Day 1 and Day 3 outputs side by side. Feeds into Project 03.' },
      },
      {
        code: '3.2', time: '35 min', title: 'Claude Routines, On-Demand Repeatable Workflows',
        covered: [
          'Routines vs Schedules: on-demand trigger vs time trigger',
          'What makes a good Routine: a task done more than twice a week following a pattern',
          'Routine anatomy: input template + multi-step prompt chain + output format',
          'Use case: Meeting Prep Routine, agenda in, briefing doc out',
          'Use case: Content Repurpose Routine, long-form in, 5 formats out',
          'Use case: Decision Analysis Routine, situation in, pros/cons/recommendation out',
          'Building Routines inside a Claude Project so they inherit your context',
        ],
        assignment: { name: 'Build 2 Routines for Real Tasks', body: 'Identify 2 recurring tasks that follow a pattern. For each: write an input template and a Routine prompt. Run with 2 real inputs; test for consistency; refine after the first run. Add both to your Claude Project.\nSubmit: Routine prompts + 1 sample output each. Feeds into Project 03.' },
      },
      {
        code: '3.3', time: '40 min', title: 'Claude for Data, Upload, Interrogate, Act',
        covered: [
          'What Claude can do with data: CSV uploads, table reading, pattern spotting, summaries',
          'How to frame a data question: what you have, what you want to know, what decision it serves',
          'Analytical prompting: "Find the top 3 anomalies" vs "Summarise this"',
          'Use case: expense data → category breakdown → savings recommendation',
          'Use case: survey results → theme extraction → 3 key findings',
          'Use case: sales pipeline → win/loss patterns → next action priorities',
          'Limitations: Claude reads and reasons, not computes, when to use Excel/Sheets AI',
        ],
        assignment: { name: 'Data Interrogation, 5 Questions, 1 Action', body: 'Find a real dataset. Upload to Claude; ask 5 specific analytical questions. From the answers, identify 1 insight you would not have noticed. Turn it into a 1-paragraph action plan. Build a Data Insight Brief (dataset description, 5 Q&A pairs, 1 insight, 1 action).\nSubmit: Claude Artifact, Data Insight Brief.' },
      },
      {
        code: '3.4', time: '55 min', title: 'External Automation, Zapier, n8n & When to Leave Claude',
        covered: [
          'The Claude-first rule: exhaust native tools before going external',
          'When external automation is necessary: multi-app triggers, live feeds, output to other platforms',
          'Zapier anatomy: Trigger → Action → Claude step → Output',
          'n8n vs Zapier: open source vs hosted, complexity ceiling, Indian pricing',
          'Designing automation logic before building it: flowchart first, tool second',
          'Use cases: Google Form → Notion; email → Gmail draft; calendar → WhatsApp/Telegram',
          'Testing and debugging automations: what breaks and how to fix it',
        ],
        assignment: { name: 'Design + Ship One External Automation, Session 03 Deliverable', body: 'Design on paper: Trigger → Claude step (exact prompt) → Output destination. Build in Zapier (free tier) or n8n using the Claude action. Trigger 3× with real inputs; screenshot all 3. Evaluate accuracy; document name, problem, time saved.\nSubmit: Live Automation System, Schedule + Routine + External Zap in one Artifact.' },
        project: { name: 'PROJECT 03: Automation Suite', body: 'Three automation systems (Schedule + Routine + external Zap) that collectively save at least 2 hours per week, each run 3× and evaluated for consistency.' },
      },
    ],
  },
  {
    session: 'S04 · Build Sprint, Portfolio & Demo Day',
    topics: [
      {
        code: '4.1', time: '65 min', title: 'Vibe Coding, Build Real Things Without Writing Code',
        covered: [
          'What is vibe coding? The shift from describing intent to iterating on output',
          'The vibe coding loop: describe → generate → test → refine → ship',
          'Claude Code as your primary build partner: framing requests, giving feedback, unsticking yourself',
          'Lovable: describe an app in plain English, get a working React frontend in minutes',
          'Bolt.new: full-stack app from a single prompt, databases, auth and UI included',
          'Replit AI: browser-based development with AI pair programming, no local setup',
          'v0 by Vercel: UI component generation from text → production-ready code',
          'When vibe coding works (MVPs, internal tools, dashboards) and when it breaks down',
        ],
        assignment: { name: 'Vibe Code Something Real in Under 30 Minutes', body: 'Pick a small, specific tool you have always wanted. Open Lovable or Bolt.new; write a specific first prompt. Iterate at least 3× (note what changed + the exact prompt). Share the live URL with one person outside the cohort; get written feedback.\nSubmit: live URL + 3 iteration prompts + 1 line of external feedback. Feeds into Project 04.' },
      },
      {
        code: '4.2', time: '20 min', title: 'Capstone Build Sprint, Ship in 20 Minutes',
        covered: [
          'Capstone options: AI Research System · Connected Workflow Engine · Automation Suite · Vibe-coded AI Tool',
          'Build criteria: must use Claude + at least 2 other tools · solve a real problem · be publicly shareable',
          'The 20-minute sprint framework: what to finish, what to cut, what to defer',
          'Combining your Session 01–03 deliverables into a unified capstone narrative',
        ],
        assignment: { name: 'Capstone Project, Final Polish', body: 'Finalise your capstone (must incorporate at least one Artifact, one workflow and one automation from Sessions 01–03). Record a 90-second Loom walkthrough (problem → Claude solving it → output; live demo, no slides). Write a 3-sentence summary. Publish via a public URL.\nSubmit before Demo Day.' },
        project: { name: 'PROJECT 04: Capstone', body: 'An AI-powered solution to a real problem, Claude at the core + 2 other tools, usable by someone else, shareable via public URL, demoable in 3 minutes.' },
      },
      {
        code: '4.3', time: '40 min', title: 'Demo Day, Present, Critique, Level Up',
        covered: [
          'Demo structure: Problem (30s) → Solution (60s) → Live demo (2 min) → Result + metric (30s)',
          'Peer feedback protocol: 1 thing that worked · 1 thing to improve · 1 question',
          'Evaluating AI work: how to talk about your process, not just your output',
          'What makes a strong AI portfolio piece: specificity, real input, measurable outcome',
          'How to handle questions about your AI workflow in a job or client context',
        ],
        assignment: { name: 'Post-Demo LinkedIn Post', body: 'Write a LinkedIn post: Hook (1 line) · Problem solved (2) · How you used AI (3) · Result/learning (2) · CTA (1). Tag Menler AI Kickstarter Program; hashtags #AILiteracy #MenlerAIKickstarter #GenerativeAI. Attach your Loom link or a screenshot. Post within 48 hours of Demo Day.\nSubmit: live LinkedIn post URL.' },
      },
      {
        code: '4.4', time: '45 min', title: 'AI-Native Career Positioning',
        covered: [
          'What "AI-native" means on a resume vs what it means in practice',
          'How to articulate AI skills without sounding generic: specificity is credibility',
          'Resume language: before and after for 3 common job roles',
          'LinkedIn About section: the AI practitioner framing, tools used + outcomes produced',
          'Building a portfolio page: what to include, what to cut, how to make it scannable',
          'AI skills as proof-of-work, not proof-of-title: show workflows, not certifications',
          'Interview questions about AI: how to answer "How do you use AI in your work?"',
        ],
        assignment: { name: 'AI-Native Profile Update', body: 'Rewrite your LinkedIn headline to include one specific AI skill/tool. Rewrite your About section (3–5 sentences): domain + how you use AI + one outcome. Update/create a portfolio page (Notion/Gamma/LinkedIn Featured) with 3 deliverables: Workflow Map · Connected Workspace · Automation System. Use Claude to write and refine; share your prompts.\nSubmit: screenshot of updated headline + About section.' },
      },
    ],
  },
];

export const KICKSTARTER_PROJECTS = [
  { code: 'P01', name: 'Personal AI Operating System', tools: 'Claude Chat · Projects · Skills · Connectors · Artifacts',
    brief: 'Design and build a fully configured Claude workspace personalised to your role, domain and recurring tasks, an AI-powered operating layer, not a chatbot. Must complete 3 real weekly tasks without switching apps or copy-pasting.',
    deliverables: ['Claude Project: system prompt (150+ words) + 2 Skill sets + 1 Connector + 1 knowledge doc', 'Claude Artifact: Project Setup Summary, what it does, what it knows, how to trigger it', '3 real task completions documented with prompt + output screenshots', 'Time comparison: estimated hours saved per week vs manual'],
    stretch: 'Add a second Connector and a third Skill. Test the workspace with someone else’s task to verify it generalises.' },
  { code: 'P02', name: 'AI Research Intelligence System', tools: 'Claude · Perplexity AI · NotebookLM · Projects · Artifacts',
    brief: 'Build a repeatable research pipeline: Claude as synthesis engine, Perplexity for live web intelligence, NotebookLM for source interrogation. Documented well enough that another person could run it. Run on a real question that matters to your career or studies.',
    deliverables: ['Research pipeline documentation: step-by-step process, tools, prompts, expected outputs per stage', 'Live research brief: 400–500 words, cited, with 3 recommendations', 'Prompt templates for each stage (Perplexity query, NotebookLM frames, Claude synthesis)', 'Reflection note: what AI got right, what needed judgement, what was missing'],
    stretch: 'Run the pipeline for 3 different topics. Package as a shareable Notion template.' },
  { code: 'P03', name: 'Automation Suite, 3 Systems Running in Parallel', tools: 'Claude Schedules · Routines · Projects · Zapier / n8n · Google Workspace',
    brief: 'Design and ship three automation systems that collectively save at least 2 hours per week, a Schedule (time-triggered), a Routine (on-demand), and an external Zap (connects Claude to an app you use). Each run 3× and evaluated for consistency.',
    deliverables: ['Claude Schedule: live and running, with Day 1 and Day 3 outputs showing prompt evolution', 'Two Claude Routines: input templates + prompt chains + 2 sample outputs each', 'One external Zap/n8n flow: trigger, Claude step prompt, output destination', 'Automation Stack Map: all 3 systems, the problem each solves, estimated time saved'],
    stretch: 'Chain the Schedule and the Zap into a fully automated weekly intelligence loop.' },
  { code: 'P04', name: 'Capstone, AI-Powered Solution for a Real Problem', tools: 'Any combination from Sessions 01–03 · Claude Code / Lovable / Bolt (optional)',
    brief: 'Identify a real problem in your work, studies, community or industry. Build an AI-powered solution with Claude at the core and at least two other tools. Must be usable by someone other than you, shareable via a public URL, and demoable in 3 minutes. Evaluated on specificity and clarity, not complexity.',
    deliverables: ['Working solution accessible via public URL (Notion, Gamma, Artifact, Lovable app, or GitHub)', '90-second Loom demo: problem → Claude solution → output (live, no slides)', 'Project brief (300 words): problem, tools, how Claude is central, outcome', 'LinkedIn post published within 48 hours of Demo Day'],
    stretch: 'Present your capstone to someone outside the cohort, a manager, client or professor. Document their feedback.' },
];


// ── AI Generalist (the Claude-First Fellowship) ──────────────────────────────
// Each week → Module. Within a week: an overview chapter, one chapter per live
// session, the weekly assignment, and the milestone project where one lands.
export const GENERALIST_WEEKS = [
  {
    week: 1,
    title: 'UNDERSTAND AI · See the Landscape Clearly',
    objective: 'You had opinions about AI. Now you have a working model of how it actually functions, technically, economically, and professionally.',
    identityShift: 'AI Curious → AI Aware',
    sessions: [
      {
        code: 'S1', title: 'How AI Actually Works, From Mathematics to Intelligence',
        carries: 'No prior week, this is the foundation everything else is built on.',
        topics: [
          'What a model is: weights, parameters, and the idea of learned patterns',
          'How LLMs work: next-token prediction, probability distributions, and why that produces coherent text',
          'Key terminology decoded: tokens, context windows, temperature, embeddings, fine-tuning, RLHF',
          'The training pipeline: pre-training → instruction tuning → alignment, why Claude behaves differently from raw GPT',
          'Inference vs training: what happens when you send a message and why it costs money',
          'Benchmark literacy: what MMLU, HumanEval, and arena ratings actually measure, and what they miss',
          'Live demo: same prompt across Claude, ChatGPT (GPT-4o), Gemini 1.5 Pro, comparing reasoning, format, and style',
          'Why Claude leads for generalist professional use: reasoning depth, instruction-following, safety, context handling',
        ],
        claudeUsage: 'First live Claude session, participants send their first structured prompts, observe how Claude reasons vs other models, and begin forming a mental model of Claude’s behaviour.',
        build: 'A 3-way model comparison exercise: an identical prompt run across Claude, ChatGPT and Gemini. Document the output differences in a personal Model Positioning Map.',
        tools: 'Claude · ChatGPT (GPT-4o) · Gemini 1.5 Pro · Perplexity',
      },
      {
        code: 'S2', title: 'The Gen AI Landscape, Categories, Tools & What’s Actually Useful',
        carries: 'Week 1 S1: understanding how models work → now applied to understanding why different tools exist for different modalities.',
        topics: [
          'Six modalities of Gen AI, Text, Image, Video, Audio, Code, Agents, how each works differently under the hood',
          'Text generation: Claude, GPT-4o, Gemini, Mistral, LLaMA, positioning, strengths, open vs closed',
          'Image generation: diffusion models explained simply, latent space, denoising, and why prompts matter so much',
          'Video generation: how AI video works, frame synthesis, motion consistency, current limitations',
          'Audio AI: TTS (text-to-speech), STT (speech-to-text), voice cloning, the technology stack behind voice AI',
          'Code AI: how code generation differs from text generation, syntax awareness, execution grounding',
          'AI Agents: what makes something an agent vs a chatbot, tool use, memory, planning, feedback loops',
          'Tool landscape overview: NotebookLM, Perplexity, HuggingFace, Runway, ElevenLabs, Cursor, where each fits',
          'Choosing tools by use case: the ‘right tool for the right job’ mental model',
        ],
        claudeUsage: 'Using Claude to research, compare, and categorise tools in real time. Building a personal AI Tool Map document inside Claude that maps tools to the participant’s role and goals.',
        build: 'Your Personal AI Landscape Map, a structured document mapping 12+ AI tools to your role, with 3 categories, use cases, and a priority shortlist. Built inside Claude, exported for future reference.',
        tools: 'Claude · Perplexity · NotebookLM · Hugging Face · Runway (preview) · ElevenLabs (preview)',
      },
    ],
    assignment: {
      name: 'My AI Landscape Report',
      brief: 'Research and document 12 AI tools across 6 categories relevant to your field (college student or professional). For each tool: what it does, how it works at a high level, who it is best for, and how Claude compares. Use Claude + Perplexity to produce the report. Include one ‘surprising use case’ per category.',
      submitAs: 'Structured PDF or Notion document, shareable',
      time: '60–75 min',
      feedsInto: 'Week 2, you will know exactly which tools to connect into your Claude workspace.',
    },
    outcome: 'A technical and practical understanding of how AI models work, what the landscape looks like, and where Claude fits. The confusion is gone. The foundation is real.',
  },
  {
    week: 2,
    title: 'TALK WITH AI · Claude Mastery, Speak the Language',
    objective: 'Last week you sent Claude a message. This week you build the operating system that runs your entire AI workflow.',
    identityShift: 'AI Aware → Claude Native',
    claudeFeatures: 'Projects · Skills · Connectors · MCPs (Model Context Protocol) · APIs · Schedules · Plugins · Claude Chat · Cowork · Code · Claude for Office (PowerPoint, Word, Excel) · System Prompts',
    sessions: [
      {
        code: 'S1', title: 'How Claude Thinks, Architecture, Memory & Configuration',
        carries: 'Week 1 S1: how LLMs work under the hood → applied directly to understanding Claude’s context, memory, and reasoning architecture.',
        topics: [
          'Context windows explained practically: what fits, what gets dropped, how to structure long conversations',
          'Statelessness and memory: why Claude forgets, what Projects solve, and how memory actually persists',
          'Claude Projects: creating persistent, role-specific environments with custom instructions and memory',
          'System prompts, the most powerful configuration layer: what they are, how Claude reads them, how to write effective ones',
          'Claude Skills: saving custom instruction sets and prompt templates that extend Claude’s default behaviour',
          'Claude Connectors: wiring Claude to Notion, Google Drive, Slack, Gmail, bidirectional live access',
          'MCPs (Model Context Protocol): how Claude connects to any external tool via a standardised protocol',
          'Claude APIs: programmatic access, what becomes possible when Claude is code, not just chat',
          'Claude Chat vs Cowork vs Code, three different modes, different use cases, live comparison',
        ],
        claudeUsage: 'Setting up the first Claude Project with a complete system prompt, custom Skills, and Connectors. Testing how system prompt changes affect Claude’s output and behaviour in real time.',
        build: 'Configure your first fully operational Claude Project, persona, system prompt, Skills, Connectors to Notion. Your personal Claude instance is live.',
        tools: 'Claude (Projects, Skills, Connectors, System Prompts) · Claude API · Notion',
      },
      {
        code: 'S2', title: 'The Full Claude Ecosystem, Schedules, Plugins, Routines & Office',
        carries: 'Week 2 S1: Claude Projects and system prompts → now extended into the full ecosystem of automation, scheduling, and native integrations.',
        topics: [
          'Claude Schedules: setting up time-triggered Claude tasks, daily briefings, weekly digests, recurring reports without code',
          'Claude Plugins: what they add, how to install, live demo of 3 different Plugins and their use cases',
          'Claude Routines: designing multi-step prompt sequences that execute automatically as a chain',
          'Claude for PowerPoint: generating full slide decks from a one-paragraph brief via Claude',
          'Claude for Word: drafting, editing, formatting documents natively inside Word with Claude',
          'Claude for Excel: data analysis, formula generation, chart creation, Claude inside your spreadsheets',
          'Notion as Claude’s external memory: bidirectional Connector, Claude reads from and writes to Notion',
          'Designing your personal Claude OS: mapping your daily workflows to Claude modes and features',
          'Claude Installations overview: where Claude lives (web, desktop, mobile, VSCode, Office, Chrome)',
        ],
        claudeUsage: 'Build a complete personal workspace in one session: Notion Connector live, one Schedule running, one Plugin installed, one PowerPoint deck generated, one Routine designed.',
        build: 'Full Claude OS launch: Notion connected, daily Schedule live, Plugin installed, PowerPoint generated from a single brief. Your AI operating system is running.',
        tools: 'Claude (Schedules, Plugins, Routines, Connectors) · Notion · Claude for PowerPoint · Claude for Word · Claude for Excel',
      },
    ],
    assignment: {
      name: 'My Claude OS, First Build',
      brief: 'Fully configure your personal Claude OS: 3 Projects for different use cases (study/work, research, creative), Notion Connector live, 3 custom system prompts written, 1 Schedule running, 1 Plugin installed, 1 Routine designed. Document every component with screenshots and explain your design decisions.',
      submitAs: 'Working system + documented walkthrough (screenshots + explanations)',
      time: '75–90 min',
      feedsInto: 'Week 3, your configured workspace is the live environment for all prompting frameworks.',
    },
    outcome: 'A fully configured, personalised Claude workspace: Projects, Skills, Connectors, Schedules, Plugins, Routines, Notion integration, Office integrations, that participants actually use every day from this point forward.',
    milestone: {
      n: 1, name: 'My Claude OS', tagline: 'Build the operating system. Use it every day.',
      objective: 'Build a fully functional, personalised Claude workspace you will use daily, not a demo, a real operating environment for your studies or work.',
      whatToBuild: '3 Claude Projects with system prompts tailored to 3 real use cases. Skills defined for your most common tasks. Notion Connector live with a working knowledge base. 1 Schedule running a daily task. 1 Plugin installed. 1 Routine chaining at least 3 steps. All documented with screenshots and decision rationale.',
      tools: 'Claude (Projects, Skills, Connectors, Schedules, Plugins, Routines) · Notion · Claude for PowerPoint / Word / Excel',
      success: 'Claude is actively doing real work for you, drafting, researching, organising, or scheduling, without manual prompting for at least one recurring task. A peer could pick it up and use it from your documentation alone.',
      presentation: '3-minute live walkthrough, show the workspace in action, trigger your Schedule or Routine live, and explain the design decisions behind your system prompts. Cohort feedback follows.',
    },
  },
  {
    week: 3,
    title: 'THINK + CREATE WITH AI · Prompt Engineering & AI Creative Studio',
    objective: 'You were asking Claude questions. Now you engineer precise instructions that produce expert-level output, and direct full visual, audio, and motion production.',
    identityShift: 'Claude Native → Strategic Prompter → AI Creative Director',
    claudeFeatures: 'Projects (prompting + creative director persona) · Skills (prompt libraries + media prompt templates) · Connectors (Notion as media asset library) · Routines (chained prompt sequences) · Schedules (automated workflows) · System Prompts (advanced architecture) · Plugins (media generation integrations)',
    sessions: [
      {
        code: 'S1', title: 'The Complete Prompt Engineering Masterclass, 16 Frameworks',
        carries: 'Week 2: Claude Projects and system prompts → now the live environment where every framework is practiced and stored.',
        topics: [
          'WHY PROMPTING MATTERS, how Claude processes a prompt: tokenisation → attention → generation. Why input structure changes output quality',
          'THE PROMPT ANATOMY, six essential components: Role · Context · Task · Constraints · Output Format · Verification step',
          'ZERO-SHOT PROMPTING, direct instruction with no examples. When it works, when it fails, and why',
          'FEW-SHOT PROMPTING, in-context learning with 2–5 examples. How example quality and diversity change output dramatically',
          'CHAIN-OF-THOUGHT (CoT), step-by-step reasoning before the answer. The science behind ‘think step by step’',
          'TREE-OF-THOUGHT (ToT), parallel reasoning branches. Claude evaluates multiple approaches before committing',
          'ROLE PROMPTING, assigning expert personas. How specificity of role changes output depth and style',
          'META-PROMPTING, prompting Claude to write, critique, and iterate your own prompts',
          'STRUCTURED OUTPUT PROMPTING, JSON, XML, tables, markdown templates. Controlling output shape for downstream use',
          'CONSTRAINT PROMPTING, negative constraints, word limits, format locks, audience specifications',
          'ITERATIVE REFINEMENT LOOPS, critique → revise → validate as a repeatable production workflow',
          'MULTI-TURN CONVERSATION DESIGN, engineering conversation arcs that build context progressively across turns',
          'RETRIEVAL-AUGMENTED PROMPTING, combining Claude with Perplexity/NotebookLM for grounded, factual output',
          'PROMPT CHAINING, output of one prompt as input to next. Building pipelines without automation tools',
          'FAILURE PATTERN DIAGNOSIS, hallucination, sycophancy, over-refusal, prompt injection. Detection and systematic fixes',
          'PROMPT DESIGN FOR AUTOMATION, writing prompts optimised for Routines, Schedules, N8N, consistent JSON output, no ambiguity',
        ],
        claudeUsage: 'Every framework practiced live inside participant Claude Projects. Skills store prompt templates by framework type. Routines chain multiple framework outputs. Connectors pull Notion reference material into Claude context during practice.',
        build: 'A personal Prompt Library: 10 production-grade prompts across 10 different frameworks, for your actual study or work tasks. Stored as a Claude Skill, mirrored to Notion via Connector, ready to use Monday morning.',
        tools: 'Claude (Projects, Skills, Connectors, Routines) · Notion · Perplexity · NotebookLM',
      },
      {
        code: 'S2', title: 'AI Creative Studio, Images, Video & Audio',
        carries: 'Week 3 S1: prompt frameworks → now the exact craft applied to directing image, video, and audio production. Week 1 S2: how diffusion models and audio AI work under the hood → now applied with production tools.',
        topics: [
          'HOW IMAGE AI WORKS, diffusion models from scratch: the denoising process, latent space, CLIP embeddings, and why prompt words map to visual concepts',
          'Image prompt architecture: subject · style · composition · lighting · mood · negative prompts · technical parameters (aspect ratio, steps, cfg scale)',
          'Gemini image generation (Imagen 3): multimodal prompting, style control, and Google ecosystem integration',
          'ChatGPT / DALL-E 3: how OpenAI’s approach differs from diffusion, CLIP-guided generation, prompt adherence',
          'Adobe Firefly: commercially safe image generation, understanding training data and IP-safe use cases',
          'Ideogram: text-in-image generation, how it handles typography that other models fail at',
          'Comparative live session: identical Claude-written prompt run across Gemini, DALL-E, Firefly, Ideogram, quality analysis',
          'HOW VIDEO AI WORKS, frame synthesis, optical flow, temporal consistency, and why video models hallucinate motion',
          'Kling: scene briefs, camera motion presets, character consistency across frames, duration control',
          'Runway Gen-3 Alpha: cinematic motion, director-style prompting, in-painting and out-painting',
          'Pika Labs: fast iteration, style locks, and the Pika 2.0 motion system',
          'HOW AUDIO AI WORKS, TTS: neural waveform synthesis, prosody modelling, voice encoding; STT: Whisper and speech recognition',
          'HOW VOICE CLONING WORKS, speaker embeddings, voice latent space, what makes a good training sample',
          'ElevenLabs: voice generation, cloning, and voice design, creating voices from scratch with acoustic parameters',
          'Suno AI: AI music generation from text prompts, genre control, lyric + melody generation',
          'Soundverse: AI audio and SFX production, mood-based generation, instrument layering, Claude writes all briefs',
          'HOW 3D AI WORKS, neural radiance fields (NeRF), gaussian splatting, procedural generation basics',
          'Blender with Claude as navigator: object creation, lighting, materials, rendering via Claude text commands',
          'Canva AI and Adobe Express: compositing AI-generated assets into finished visual layouts',
          'Full AI Media Kit assembly: brief → images → video → audio/music → 3D → layout → packaged output',
        ],
        claudeUsage: 'Creative Director system prompt inside a Claude Project. Claude writes all image prompts, video scene briefs, audio scripts, and comparative analysis documents. Skills store reusable prompt templates by media type and style. Connectors sync all produced assets to the Notion Media Library automatically.',
        build: 'Produce one complete media package for a real project: 4 images, 1 video clip, 1 audio/music asset, 1 Blender render, assembled into a Canva or Figma layout. All prompts documented as a Claude Skill. Assets stored in Notion.',
        tools: 'Claude (Projects, Skills, Connectors) · Gemini (Imagen 3) · ChatGPT / DALL-E 3 · Adobe Firefly · Ideogram · Kling · Runway Gen-3 · Pika Labs · ElevenLabs · Suno AI · Soundverse · Blender 3D · Canva AI · Figma · Adobe Express',
      },
    ],
    assignment: {
      name: 'My AI Productivity Playbook + AI Media Kit',
      brief: 'Build your combined AI output for Week 3: (1) A Prompt Library of 10 prompts across 10 frameworks stored as a Claude Skill. (2) A documented research pipeline using Perplexity → Claude → NotebookLM. (3) A Routine that automates a real recurring task, meeting notes, weekly digest, or email drafts. (4) A Gamma deck produced from a Claude brief on a topic relevant to your field. (5) A complete AI Media Kit, 4 AI images (2+ platforms compared, prompt rationale documented), 1 Kling or Runway video (15–30 sec), 1 Suno or Soundverse audio asset, 1 Blender 3D render, 1 Gamma deck presenting the brand. All prompts documented as a Claude Skill. All assets stored in Notion.',
      submitAs: 'Notion workspace with all components + exported PDF summary + media assets',
      time: '90–105 min',
      feedsInto: 'Week 4, your prompt mastery, pipelines, and media production skills are the foundation for voice scripting and automation pipelines.',
    },
    outcome: 'A working personal AI productivity system and a complete, portfolio-grade AI Media Kit, built with a technical understanding of how each creative AI technology works. Participants are thinking with AI at a structural level and directing full creative production from a brief.',
    milestone: {
      n: 2, name: 'AI Media Kit, Real Brand, Real Assets', tagline: 'Prompt craft meets creative direction, all in one week.',
      objective: 'Produce a complete, cohesive AI-generated media package for a real project, something that actually gets used, not a demo.',
      whatToBuild: '4 AI images (2+ platforms compared, best selected), 1 AI video (15–30 sec, Kling or Runway), 1 AI music/audio asset (Suno or Soundverse), 1 Blender 3D render, 1 Canva/Figma layout compositing all assets, 1 Gamma brand deck, all for a real startup concept, personal brand, college project, social cause, or product idea.',
      tools: 'Claude (Projects, Skills, Connectors) · Gemini/DALL-E/Firefly/Ideogram (images) · Kling/Runway (video) · Suno/Soundverse (audio) · Blender · Canva AI · Figma · Gamma',
      success: 'Every asset is production-quality and tells a coherent story. Prompt rationale documented for every asset. A stranger could identify the brand from the media alone. You would publish or pitch with this.',
      presentation: 'Gallery-style walkthrough: show each asset, explain the technology behind it (how the AI actually made it), demonstrate the Claude prompt, and show one iteration comparison. 4 minutes max.',
    },
  },
  {
    week: 4,
    title: 'AUTOMATE WITH AI · Voice Agents, Routines & Workflows',
    objective: 'You were producing outputs. Now you are building infrastructure, voice agents, Claude Routines, agentic loops, and automated pipelines that reason, decide, and act without you touching a keyboard.',
    identityShift: 'AI Creative Director → AI Automation Architect → AI Systems Operator',
    claudeFeatures: 'Routines (multi-step automated sequences) · Schedules (time-triggered automation) · MCPs (external tool access inside agents) · APIs (Claude as automation brain) · Projects (agent + voice persona config) · Skills (reusable agent logic + voice script templates) · Connectors (Notion, Slack, Gmail as data destinations)',
    sessions: [
      {
        code: 'S1', title: 'AI Voice Technology + Voice Agents, From STT to Live Callable Agents',
        carries: 'Week 1 S2: audio AI technology overview → now applied hands-on with production tools. Week 3 S2: audio AI production foundations → now extended into conversational voice agent architecture.',
        topics: [
          'HOW STT WORKS, speech-to-text from first principles: acoustic modelling, language modelling, and beam search decoding',
          'Whisper by OpenAI: architecture, model sizes, word error rates, multilingual support, when to use which size',
          'Deepgram: real-time STT for live applications, streaming audio, speaker diarisation, confidence scores',
          'AssemblyAI: STT with understanding, entity detection, sentiment, content safety, topic detection built in',
          'HOW TTS WORKS, text-to-speech synthesis: concatenative vs neural vs diffusion-based generation',
          'Prosody: what it is, how neural TTS controls pitch, rate, emphasis, and pausing, the SSML markup system',
          'HOW VOICE CLONING WORKS, speaker embeddings, voice latent space, zero-shot vs few-shot cloning',
          'ElevenLabs deep-dive: Voice Lab, voice cloning from samples, voice design from acoustic parameters, multilingual voices',
          'PlayHT: voice generation alternative, ultra-realistic TTS, voice cloning, and streaming API',
          'Claude as voice scriptwriter: designing scripts with prosody markers, pause notation, emphasis instructions',
          'Building a full voice content pipeline: Claude writes script → ElevenLabs generates voice → audio exported and stored',
          'WHAT A VOICE AGENT IS, the full technology stack: STT → LLM reasoning → TTS → telephony/channel → back to STT',
          'Conversation design fundamentals: intents, entities, slots, dialogue states, and conversation flow diagrams',
          'Turn-taking in voice: barge-in detection, silence thresholds, confirmation patterns, graceful fallbacks',
          'VAPI: the leading voice agent infrastructure platform, phone numbers, webhooks, Claude integration, call analytics',
          'Bland AI: outbound voice agent automation, scheduling calls, handling objections, transferring to humans',
          'Retell AI: voice agent builder, conversation flows, persona design, knowledge base integration',
          'Claude as the voice agent brain: system prompt architecture for conversational AI, constraints, persona, tool access',
          'MCPs for voice agents: giving the agent real-time access to Notion, CRM, calendar during a live call',
          'Connecting voice agents to N8N: call ends → transcript → Claude analysis → CRM update → follow-up email',
        ],
        claudeUsage: 'Voice Director system prompt in a Claude Project. Claude writes full voice scripts with prosody direction embedded. A complete voice agent system prompt architected, persona, conversation constraints, escalation logic, MCP tool access, fallback instructions. Skills store script templates by context.',
        build: 'Full voice production pipeline: Claude writes a 3-minute script → ElevenLabs clones or designs the voice → final audio asset exported. Plus a live, callable voice agent, Claude-designed persona and conversation flow, ElevenLabs voice, deployed via VAPI with a real phone number or web widget. Make a live call to your own agent in session.',
        tools: 'Claude (Projects, Routines, Skills, MCPs, APIs) · ElevenLabs · PlayHT · Whisper (via API) · Deepgram · AssemblyAI · VAPI · Bland AI · Retell AI · Notion',
      },
      {
        code: 'S2', title: 'Agents, Routines & Workflow Automation at Scale, N8N, Make & Claude',
        carries: 'Week 4 S1: voice agent architecture and agentic loop design → now deployed inside visual workflow automation platforms.',
        topics: [
          'WHAT AN AGENT IS, the fundamental loop: Perception → Reasoning → Action → Memory → repeat. How this differs from a chatbot',
          'The four components of any agent: LLM brain, tool access, memory layer, planning mechanism',
          'Tool calling explained: how Claude decides to call a tool, what the response looks like, how it integrates the result',
          'Memory types: in-context (conversation), external (Notion/database), semantic (vector stores), episodic (past interactions)',
          'Agent failure modes: hallucinated tool calls, infinite loops, context overflow, instruction drift, and how to prevent each',
          'CLAUDE ROUTINES, designing multi-step prompt chains that execute as a single automated sequence',
          'Building your first Routine: research → summarise → format → store → notify, 5 steps, no code, live',
          'CLAUDE SCHEDULES for recurring agents: daily briefing, weekly digest, monthly report, set once, runs forever',
          'MCPs as agent tools: giving Claude real-time access to Notion, Slack, Gmail, Calendar inside a Routine',
          'System prompt architecture for agents: goals, tools list, constraints, memory instructions, escalation logic',
          'Multi-agent design: when to use one Claude vs multiple Claude instances with different roles',
          'HOW WORKFLOW AUTOMATION WORKS, triggers, actions, conditions, and data transformation, the universal automation model',
          'N8N architecture deep-dive: nodes, webhooks, HTTP requests, credential management, error handling, retry logic',
          'Building Claude into N8N: the HTTP Request node, API authentication, prompt engineering for structured JSON responses',
          'Conditional logic in N8N: IF/Switch nodes, filtering outputs, routing Claude’s response to different downstream actions',
          'Make (Integromat): visual workflow canvas, modules, routers, aggregators, how it differs from N8N and when to choose it',
          'Zapier for no-code automation: Zap structure, multi-step Zaps, Zapier Tables, and Claude integration via webhook',
          'Claude API prompts optimised for automation: consistent JSON output, error handling in prompt, fallback instructions',
          'Claude Routines + N8N working together: some steps in Claude native, complex branching in N8N, hybrid architecture',
          'Airtable as a structured data layer: connecting Claude outputs to Airtable for tracking, filtering, and dashboards',
          'Real automation patterns: content pipeline, lead qualification, research digest, social media scheduler, email router',
          'Voice-to-automation integration: VAPI call ends → transcript → Claude API analysis → N8N routing → Notion + Slack',
        ],
        claudeUsage: 'Designing agentic system prompts inside Projects. Building a live Claude Routine that chains 5 steps, research via Perplexity, summarise, format as JSON, store to Notion via Connector, send a Slack notification via MCP. The Claude API called as the intelligence node inside N8N and Make.',
        build: 'A fully autonomous Claude Routine: triggered on Schedule, performs 5 steps, stores results in Notion, sends a notification, running completely without human input. Plus a live, working N8N automation: webhook trigger → Claude API processes and returns structured JSON → conditional routing → data stored in Notion and Airtable → Slack notification.',
        tools: 'Claude (Projects, Routines, Schedules, MCPs, Connectors, API) · N8N · Make · Zapier · Notion · Airtable · Slack · VAPI (voice trigger integration) · Perplexity',
      },
    ],
    assignment: {
      name: 'My Automated AI System, Full Build',
      brief: 'Build a complete Automated AI System: a multi-step N8N or Make workflow with Claude as the intelligence layer, Claude Routines handling native steps, MCP connections to 3+ tools, and a voice layer built with VAPI or ElevenLabs. The system must solve a real problem: student onboarding, customer intake, content pipeline, research assistant, or appointment system. Must run end-to-end without manual input.',
      submitAs: 'Live system + demo video (show it running, show a voice interaction, show the data output)',
      time: '90 min',
      feedsInto: 'Week 5, your systems thinking and API experience directly inform product architecture and app development.',
    },
    outcome: 'A deep understanding of how agents, voice technology, and automation work, from the agentic loop to the N8N node. A live, running Automated AI System with voice capability. The AI Systems Operator identity is unlocked.',
    milestone: {
      n: 3, name: 'My Automated AI System', tagline: 'Voice-enabled. Claude-brained. Multi-tool connected. Running without you.',
      objective: 'Build a live, end-to-end automated system that operates without you, Claude-brained, voice-enabled, multi-tool connected, with a real use case that creates genuine value.',
      whatToBuild: 'Choose one: (A) AI Student Assistant, a voice agent that answers course FAQs, logs questions to Notion, and emails weekly summaries. (B) AI Startup Intake System, a voice agent that collects leads, qualifies them via Claude, stores to Airtable, and sends personalised follow-ups. (C) AI Content Pipeline, an automated system that researches topics, generates scripts, produces audio via ElevenLabs, and publishes to a Notion dashboard. (D) Your own design, must include Claude Routines, a voice layer, 3+ connected tools, and autonomous operation.',
      tools: 'Claude (Projects, Routines, Schedules, MCPs, API) · VAPI or ElevenLabs · N8N or Make · Notion · Airtable · plus tools specific to your use case',
      success: 'The system runs on a trigger without manual input. Voice interaction works end-to-end. Data flows correctly through all connected tools. A non-technical person could use it and get value from it.',
      presentation: 'Live demo: trigger the system in real time. Show the voice interaction (call in or playback). Show data flowing into Notion/Airtable. Walk through the Claude Routine or N8N flow. 4 minutes.',
    },
  },
  {
    week: 5,
    title: 'BUILD WITH AI · Vibecoding & Agentic App Development',
    objective: 'You automated workflows. Now you are shipping products, real, functional apps built with Claude Code, AI editors, and agentic scaffolding. No CS degree. No waiting for a developer.',
    identityShift: 'AI Systems Operator → AI Product Builder',
    claudeFeatures: 'Claude Code (terminal + AI IDE) · MCPs (tool integrations inside apps) · APIs (Claude as app reasoning brain) · Projects (full app context across sessions) · Skills (reusable code patterns + components) · Connectors (live data sources inside apps) · Plugins (Claude extensions for development)',
    sessions: [
      {
        code: 'S1', title: 'How to Build with AI, Vibecoding, Claude Code & Lovable',
        carries: 'Week 3 S1: advanced prompting and structured output → now the exact technique for engineering-grade prompts inside Claude Code and Cursor.',
        topics: [
          'HOW AI CODE GENERATION WORKS, code models vs language models: syntax trees, execution context, and why code is different from text',
          'The vibecoding philosophy: describe intent → generate → test → iterate → own the output. You are the architect, Claude is the builder',
          'CLAUDE CODE, installation and setup, CLAUDE.md project context files, how to give Claude maximum context',
          'Claude Code with MCPs: wiring the coding environment to GitHub, Supabase, Notion, and external APIs during development',
          'Cursor IDE: tab-complete, Cmd-K inline edit, chat sidebar, composer mode, the four interaction patterns and when to use each',
          'The CLAUDE.md context file: what to put in it, how Claude uses it, why it’s your most important file in any project',
          'Lovable for full-stack app generation: how it works, prompt patterns for UI and database design, iterating components',
          'Bolt.new: instant web app scaffolding from a single prompt, when to start here vs Claude Code',
          'Claude Skills as code snippet libraries: reusable component patterns, API integration templates stored and recalled',
          'The build loop: requirements → architecture → generate → test → debug → refine → deploy',
          'Reading and owning AI-generated code: how to understand what Claude built, where it might be wrong, and how to extend it',
        ],
        claudeUsage: 'Claude Code as primary engineering intelligence. MCPs connect to GitHub and Supabase during development. Skills store reusable patterns. Projects maintain full app context across all development sessions.',
        build: 'Build and deploy a functional web app in 90 minutes: idea → Claude Code / Lovable generates the app → Replit deploys it → you have a live URL. A real product, running, shareable.',
        tools: 'Claude (Code, Projects, Skills, MCPs) · Cursor · Lovable · Bolt.new · Replit · GitHub · Supabase',
      },
      {
        code: 'S2', title: 'Agentic Apps, Claude as the Brain, Real Products, Capstone Planning',
        carries: 'Week 4: agentic design and MCP tool-calling → now embedded inside real product applications with user interfaces and live deployment.',
        topics: [
          'WHAT MAKES AN APP ‘AGENTIC’, tool-calling inside a product: how Claude receives user input, decides to call a tool, integrates the result, and responds',
          'App architecture with the Claude API: frontend → API layer → Claude with MCP tools → database → back to frontend',
          'Supabase as the backend: PostgreSQL database, authentication, real-time subscriptions, edge functions, and how Claude reads/writes to it',
          'Claude Connectors inside apps: wiring a user’s Notion or Drive into your app so Claude has personalised context per user',
          'Emergent: agentic app scaffolding, describe the agent behaviour, get the app architecture and code',
          'Replit for cloud deployment: from localhost to live URL, environment variables, custom domains',
          'Hugging Face Spaces: deploying open-source model integrations alongside Claude for specialised tasks',
          'CAPSTONE PLANNING SESSION, every participant defines their capstone product: problem statement, user journey, tech stack, Claude architecture, build plan',
          'CLAUDE.md for your capstone: writing the context file that will guide Claude through your entire build sprint',
        ],
        claudeUsage: 'The Claude API with MCP tool calls is the agent brain inside the product app. Connectors personalise Claude per user. Projects maintain full app architecture context. Skills store component and agent prompt patterns. The capstone CLAUDE.md is written with Claude’s help.',
        build: 'An agentic app with Claude as the decision engine, deployed on Replit with a real UI, Claude reasoning using MCP tool access under the hood, results surfacing in real time. Plus your capstone CLAUDE.md and scope doc.',
        tools: 'Claude (API, Projects, MCPs, Connectors, Skills) · Replit · Emergent · Supabase · Hugging Face Spaces · Cursor · GitHub',
      },
    ],
    assignment: {
      name: 'Capstone Scope Document + MVP Skeleton',
      brief: 'Produce a complete capstone product brief: problem statement, target user, solution, tech stack with justification, Claude architecture (system prompt design, MCP tools needed, Routines required), build plan with time estimates, and success criteria. Then scaffold the MVP: CLAUDE.md context file written and tested, file/folder structure created, first working component or route live on Replit.',
      submitAs: 'Product brief document + scaffolded project repository with CLAUDE.md + first deployed route',
      time: '75–90 min',
      feedsInto: 'Week 6, your scope doc and skeleton are your Demo Day build plan. Show up ready to build, not ready to plan.',
    },
    outcome: 'Participants have shipped at least one functional web app, understand agentic architecture inside products with MCP integrations, and have a scoped and fully scaffolded capstone ready to build. The developer identity is unlocked, no CS degree required.',
  },
  {
    week: 6,
    title: 'AI NATIVE · Ship It, Capstone Sprint & Demo Day',
    objective: 'Five weeks of skills. One Demo Day. You prove everything by shipping a real product and presenting it live. The title of AI Generalist is earned, not given.',
    identityShift: 'AI Product Builder → AI Generalist · Fully Native',
    claudeFeatures: 'Full Claude stack, every feature, every mode · Projects (capstone context across the full sprint) · MCPs (live product integrations) · APIs (product intelligence layer) · Skills (reusable patterns) · Connectors (live user data) · Routines + Schedules (autonomous product behaviour) · Claude Code (primary build tool)',
    sessions: [
      {
        code: 'S1', title: 'Capstone Build Sprint, Final Build, Polish & Demo Preparation',
        carries: 'All prior weeks: Week 2 Claude OS, Week 3 prompting + media, Week 4 automation and voice, Week 5 app development, all converge into your final product.',
        topics: [
          'Structured build sprint: 90-minute focused build with the full Claude stack and mentor availability',
          'Using the CLAUDE.md context file during the sprint: keeping Claude on track, correcting drift, extending functionality',
          'Product polish checklist: error handling, loading states, edge cases, MCP reliability, mobile responsiveness',
          'Demo script writing: problem → solution → live demo → impact, Claude helps write and rehearse the presentation',
          'Gamma deck construction from Claude-generated content: 5-slide structure (Problem, Solution, Demo, Stack, Impact)',
          'Presentation coaching: 5-minute structure, live demo best practices, what to show and what to skip',
          'Rapid peer feedback round: 90-second demos to a partner, immediate feedback, last iteration before Demo Day',
          'Demo Day logistics: format, order, timing, Q&A structure, portfolio documentation',
        ],
        claudeUsage: 'Full Claude stack: Claude Code for final builds and debugging, Claude API + MCPs for product intelligence, Connectors for live data, Routines for automated product features, Projects for complete context. Claude also writes the Demo Day narrative and Gamma deck.',
        build: 'Capstone final sprint: product polish, demo rehearsal, Gamma deck live. You leave this session with a working product and a polished presentation. Demo Day is tomorrow.',
        tools: 'Claude (full stack) · Gamma · Notion · your capstone stack',
      },
      {
        code: 'S2', title: 'Demo Day, Ship It, Show It, Own It',
        carries: 'Every prior week, this session is the proof of the entire journey.',
        topics: [
          '5-minute format per participant: 2-min Gamma deck walkthrough + 3-min live product demo',
          'Show Claude working live: MCP tool calls, Routines running, API reasoning visible, the AI is not hidden, it is the point',
          'Live Q&A from peers and mentors: technical questions, use case challenges, what to build next',
          'Menler Showcase: top 3 builds selected for the wider Menler community and alumni network',
          'Portfolio documentation: capstone write-up, project README, and demo video recording',
          'AI Generalist certification criteria: project quality, technical depth, presentation, and peer evaluation',
          'What comes next: the Menler alumni network, continuing education paths, how to keep building',
        ],
        claudeUsage: 'Claude runs under the hood of every capstone presented. Participants demonstrate live MCP connections, Routines, and API reasoning during their demos: Claude’s role is visible and central, not hidden.',
        build: 'The Moment: stand up, present your problem, demo your product with Claude powering it live, answer questions. You are the AI Generalist. This is the proof.',
        tools: 'Claude (full stack) · Gamma · your full production stack',
      },
    ],
    assignment: {
      name: 'Capstone Product, Ship It',
      brief: 'A real, working AI-powered product that solves a genuine problem, for yourself, your college, your community, or a market you understand. Choose from: (A) AI Study Assistant for your college with course-specific knowledge, voice Q&A, and progress tracking. (B) AI Startup MVP, an agentic tool solving a real market problem, pitched as a product. (C) AI Automation Business, a packaged automated system that could be sold as a service. (D) AI Creative Platform, a tool others can use to create, produce, or publish with AI. Claude must be visible and central. MCPs, Routines, or API calls must be live and demonstrable.',
      submitAs: 'Live product + Gamma deck (5 slides) + Demo Day presentation + capstone write-up',
      time: 'Demo Day',
      feedsInto: 'Nothing feeds forward, you carry this with you. This is your portfolio. This is your proof.',
    },
    outcome: 'Certified Menler AI Generalist. 4 portfolio-grade projects. A live AI stack. The technical understanding and hands-on ability to think, create, automate, and ship with AI at a professional level. The title is not given, it is demonstrated.',
    milestone: {
      n: 4, name: 'Ship It, The AI Generalist Capstone', tagline: 'Build it. Ship it. Demo it. Prove it.',
      objective: 'Build and present a real, working AI-powered product that demonstrates technical understanding, creative direction, automation design, and product thinking, all in one thing you shipped.',
      whatToBuild: 'A web app, voice agent system, agentic tool, or automated platform that solves a real problem for real users. Must be live and functional during the demo. Claude’s role must be visible and demonstrable. Choose a format: Study Assistant, Startup MVP, Automation Service, or Creative Platform.',
      tools: 'Claude (required: Projects, MCPs, API, Code, Routines, Schedules) · plus your chosen stack from the fellowship',
      success: 'Works live in front of an audience without crashing. Claude’s intelligence is visible and central to the product. A stranger could use it and get value from it. You could pitch it to a founder, professor, or employer. You would put it on your CV or portfolio without hesitation.',
      presentation: '5 minutes total: 2-min Gamma deck (Problem · Solution · Demo · Stack · Impact) + 3-min live product demo with Claude reasoning visible. Q&A follows. Portfolio write-up submitted within 24 hours.',
    },
  },
];

// ── Module builders ──────────────────────────────────────────────────────────
const bullets = (xs) => xs.map((x) => `• ${x}`).join('\n');

export function kickstarterModules() {
  const modules = KICKSTARTER_SESSIONS.map((s, i) => ({
    title: s.session,
    order: i,
    chapters: s.topics.map((t, ci) => ({
      title: `${t.code} · ${t.title} · ${t.time}`,
      order: ci,
      topics: [
        { title: "What's covered", contentType: 'text', body: bullets(t.covered), order: 0 },
        { title: `Assignment: ${t.assignment.name}`, contentType: 'text', body: t.assignment.body, order: 1 },
        ...(t.project ? [{ title: t.project.name, contentType: 'text', body: t.project.body, order: 2 }] : []),
      ],
    })),
  }));
  // Portfolio projects as a final module.
  modules.push({
    title: 'Portfolio Projects: All 4',
    order: KICKSTARTER_SESSIONS.length,
    chapters: KICKSTARTER_PROJECTS.map((p, i) => ({
      title: `${p.code} · ${p.name}`,
      order: i,
      topics: [
        { title: 'Tools', contentType: 'text', body: p.tools, order: 0 },
        { title: 'Project brief', contentType: 'text', body: p.brief, order: 1 },
        { title: 'Deliverables', contentType: 'text', body: bullets(p.deliverables), order: 2 },
        { title: 'Stretch goal', contentType: 'text', body: p.stretch, order: 3 },
      ],
    })),
  });
  return modules;
}

export function generalistModules() {
  return GENERALIST_WEEKS.map((w, wi) => {
    const chapters = [
      {
        title: 'Week overview',
        order: 0,
        topics: [
          { title: 'Weekly objective', contentType: 'text', body: w.objective, order: 0 },
          { title: 'Identity shift', contentType: 'text', body: w.identityShift, order: 1 },
          ...(w.claudeFeatures
            ? [{ title: 'Claude features applied this week', contentType: 'text', body: w.claudeFeatures, order: 2 }]
            : []),
          { title: 'Week outcome', contentType: 'text', body: w.outcome, order: w.claudeFeatures ? 3 : 2 },
        ],
      },
      ...w.sessions.map((s, si) => ({
        title: `${s.code} · Week ${w.week}: ${s.title}`,
        order: si + 1,
        topics: [
          { title: 'Carries forward', contentType: 'text', body: s.carries, order: 0 },
          { title: 'Key topics covered', contentType: 'text', body: bullets(s.topics), order: 1 },
          { title: 'Claude usage in this session', contentType: 'text', body: s.claudeUsage, order: 2 },
          { title: 'Build', contentType: 'text', body: s.build, order: 3 },
          { title: 'Tool stack this session', contentType: 'text', body: s.tools, order: 4 },
        ],
      })),
      {
        title: `Weekly Assignment: ${w.assignment.name}`,
        order: w.sessions.length + 1,
        topics: [
          { title: 'Brief', contentType: 'text', body: w.assignment.brief, order: 0 },
          {
            title: 'Submission',
            contentType: 'text',
            body: `Submit as: ${w.assignment.submitAs}\nTime estimate: ${w.assignment.time}\nFeeds into: ${w.assignment.feedsInto}`,
            order: 1,
          },
        ],
      },
    ];
    if (w.milestone) {
      const m = w.milestone;
      chapters.push({
        title: `Milestone Project ${m.n} · ${m.name}`,
        order: chapters.length,
        topics: [
          { title: 'Objective', contentType: 'text', body: `${m.tagline}\n\n${m.objective}`, order: 0 },
          { title: 'What to build', contentType: 'text', body: m.whatToBuild, order: 1 },
          { title: 'Tools', contentType: 'text', body: m.tools, order: 2 },
          { title: 'Success criteria', contentType: 'text', body: m.success, order: 3 },
          { title: 'Presentation', contentType: 'text', body: m.presentation, order: 4 },
        ],
      });
    }
    return { title: `WEEK ${w.week} · ${w.title}`, order: wi, chapters };
  });
}

export const KICKSTARTER_DESCRIPTION =
  'Menler AI Kickstarter: 4 sessions, 19 topics, 4 portfolio projects. Two weekends, one portfolio.';
export const GENERALIST_DESCRIPTION =
  'The Claude-First AI Generalist Fellowship: 6 weeks, 12 live sessions, 4 milestone projects. Build-first, Claude at the centre of every week.';
