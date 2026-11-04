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
        project: 'P01',
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
        project: 'P02',
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
        project: 'P03',
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
        project: 'P04',
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

// ── AI Engineering Fellowship - FDE ──────────────────────────────────────────
// Transcribed from docs/fde-fellowship: the Programme Curriculum and its Index.
// The curriculum holds the weeks; the Index adds a line on what each of the
// 120 topics teaches and one hands-on task for each, so a session's topics are
// [code, topic, what it teaches, hands-on task].
//
// The tree is the Generalist's (week → S1/S2 → weekly assignment → milestone),
// because that is the shape the Learning page, the class scheduler and the
// assignment sync all read. What the FDE adds sits beside those chapters:
//   · a Case chapter opening each two-week block (context, ask, engagement brief)
//   · a Lab chapter in Weeks 1, 4 and 5
// The syllabus counts six projects, so a project is one piece of work, due and
// defended on its block's second Sunday. Week A's checkpoint is a slice of it,
// reviewed in the 1:1 and listed on the project's brief, not a hand-in or a
// chapter of its own.
export const FDE_CASES = [
  {
    n: 1, weeks: '1–2', sector: 'BFSI', title: 'Complaint Triage for a Bank Grievance Cell',
    project: 'Complaint Triage Engine', origin: 'Built from scratch.',
    context: 'RBI Integrated Ombudsman Scheme, FY2024-25: complaints reached about 13.34 lakh, up 13.55% from the year before, and 93.07% were resolved. Banks accounted for 2,41,601 complaints (81.53%) at the Ombudsman offices and NBFCs for 14.80%, with loans and advances the top category and credit cards second. Only 62.16% were maintainable; the rest were duplicates, lacked information, were already dealt with, or fell outside RBI’s jurisdiction. A secondary source reports that the RBI Governor said complaints grew about 50% a year over two years while processing capacity grew about 25% (March 2025 remarks). Triage quality is therefore a real bottleneck.',
    ask: 'A grievance cell (head of customer grievance, compliance officer and contact-centre lead, played by mentors) wants every inbound complaint classified, checked for completeness and duplicates, routed, and given a draft first response, in English, Hindi and Hinglish.',
    dataKit: 'Synthetic complaints in three language styles, with category mix modelled on the public annual-report distribution, plus a sample of prior complaints and policy snippets.',
    constraints: 'The system never closes or rejects a complaint on its own. Every routing decision is explainable. Customer identifiers are masked.',
    objective: 'Ship a triage engine that classifies, checks and routes complaints, and prove it beats a classical baseline.',
    hidden: 'Examples of the ~10 you will not see: One complaint carrying two issues · abusive Hinglish · a duplicate of an earlier case · a matter outside the regulator’s jurisdiction · missing account details · a customer who pastes an ID number · a message that tries to instruct the triage model.',
    success: 'Schema validity 99%, per-category F1 with confidence intervals, duplicate and non-maintainable detection reported separately.',
    curveball: 'A new category and Tamil complaints appear mid-block.',
    tracks: 'Builder: provided harness and prompt templates. Engineer: adds batching, thinking-budget trade-offs and CI regression.',
    time: '8 live + 15 outside hours.',
    focus: 'Why this pilot first, why this model over the baseline, what you would measure in week one live.',
    submit: 'Repository link + benchmark report',
  },
  {
    n: 2, weeks: '3–4', sector: 'Agriculture', title: 'Vetted-Answer Farm Advisory Copilot',
    project: 'Cited Farm Advisory Copilot', origin: 'Built from scratch.',
    context: 'Digital Green and Gooey.AI built Farmer.Chat, a GPT-4-based assistant trained only on trusted, local resources (farmer videos, government extension documents, call-centre transcripts and manuals). It accepts text, audio and images in languages including Hindi, Telugu and Bhojpuri, and was piloted with extension workers before being scaled to farmers. OpenAI’s customer story gives early estimates that it could cut extension cost from $35 to $0.35 per farmer; that is a claim, not a measured result. Wadhwani AI has also explored generative AI for Kisan call centres.',
    ask: 'An agricultural extension programme (programme head and a state extension officer, played by mentors) wants a copilot, first for extension agents and later for farmers. It must answer only from vetted package-of-practices documents, in local languages, with sources, and say "I don’t know" when the material does not cover a question.',
    dataKit: 'Public-style crop advisories in PDF (some scanned, some conflicting between seasons), synthetic call-centre transcripts, a small video-transcript set, and synthetic farmer profiles.',
    constraints: 'Pesticide and dosage questions must cite a source and point to a human officer. Farmer phone numbers and IDs are protected (DPDP basics). The system must be usable by agents with low-end phones.',
    objective: 'Ship a console and a copilot that answers only from vetted sources, cites every claim and abstains correctly.',
    hidden: 'Examples of the ~10 you will not see: A Hindi query with spelling variants · two advisories that disagree by season · a question the corpus cannot answer · a dosage question · a farmer who shares an ID number · a stale advisory after an update.',
    success: 'Faithfulness 90% on answerable questions, 85% correct abstention, every claim cited.',
    curveball: 'A new advisory replaces an old one and stale answers must disappear within an hour.',
    tracks: 'Builder: provided pipeline skeleton. Engineer: writes the retriever and reranker and adds a knowledge-graph path.',
    time: '8 live + 16 outside hours.',
    focus: 'Why your chunking and embedding choices, and show one retrieval failure and your fix.',
    submit: 'Deployed copilot link + repository link + bake-off report',
  },
  {
    n: 3, weeks: '5–6', sector: 'SME finance', title: 'GST Input-Credit Reconciliation Agent',
    project: 'Reconciliation Agent and Public MCP Server', origin: 'Built from scratch.',
    context: 'GSTR-2B is a static monthly statement. Mismatches commonly arise when suppliers file GSTR-1 late (pushing credit to the next cycle), report B2B invoices as B2C, or lack a valid IRN, and the fix is to ask suppliers to amend. Reconciliation is best done monthly, before filing GSTR-3B, and a supplier’s credit note reduces the available credit. Credit that goes unreconciled can be lost permanently, so this is a recurring chase-and-verify workload for SME finance teams. GST rules change often, so a chartered accountant reviews this brief before each cohort.',
    ask: 'A finance controller and a chartered accountant (played by mentors) want an agent that reconciles the purchase register against GSTR-2B each month, explains every mismatch, chases suppliers and prepares a review pack. It never files returns and never decides credit eligibility. A human approves every credit decision.',
    dataKit: 'Synthetic purchase register (spreadsheet export), GSTR-2B-style JSON, a supplier master with contacts, a sandbox ERP, and a WhatsApp and email sandbox.',
    constraints: 'No credit decision without human approval. No return is ever filed by the agent. Every supplier message is logged and sent at most once.',
    objective: 'Ship a reconciliation agent behind a published MCP server, with approval gates and safe integrations.',
    hidden: 'Examples of the ~10 you will not see: A GSTIN typo · an invoice that lands in next month’s statement · a credit note · a duplicate register line · a supplier who says "already paid" with no proof · a request to "just claim it" · a duplicate webhook.',
    success: 'Zero credit decisions without human approval, zero double-sent supplier messages, mismatch explanations reviewed by the pod’s "accountant".',
    curveball: 'The ERP goes down on filing day.',
    tracks: 'Builder: agent scaffold and n8n templates. Engineer: writes the webhook receiver, queue and a connector.',
    time: '8 live + 15 outside hours. Gate: the mid-point defence closes this block.',
    focus: 'Why this autonomy boundary, and what happens when a supplier lies.',
    submit: 'Repository link + test pack + runbook',
  },
  {
    n: 4, weeks: '7–8', sector: 'Health insurance', title: 'Certify a Health Pre-Authorisation Review Assistant',
    project: 'Certified Review Assistant', origin: 'Inherited prototype: inherit, evaluate, harden.',
    context: 'Under PM-JAY, pre-authorisation is required for most packages and claims need mandatory supporting documents; the National Anti-Fraud Unit flags suspected fraud using internally developed algorithms. An older report put triggered transactions at 0.25% of admissions, of which 0.07% were confirmed fraud, and said over 390 hospitals received show-cause notices and about 171 were de-empanelled. A CAG report found claims paid for patients already listed as deceased, pointing to verification lapses at state agencies. The scheme had 24.33 crore cards by August 2023, and the government says it uses AI/ML to detect suspicious transactions. The very low fraud base rate and the weak identity checks make this a case for rigorous evaluation and security.',
    ask: 'A state health agency or insurer’s claims team (medical officer, compliance head and IT security lead, played by mentors) has a prototype that reads pre-authorisation requests and highlights inconsistencies. They want it certified for go-live or rejected. It recommends only. It never denies a claim.',
    dataKit: 'Synthetic pre-auth packets (forms, discharge summaries, identity details), a rules sheet, and labelled cases from a mentor "medical officer". No real patient data.',
    constraints: 'Inherited prototype: Menler supplies "Review Assistant v0". It works on the demo set but has seeded flaws: it trusts text inside documents, logs patient data, gives no confidence, and is weaker on Hindi and Tamil documents.',
    objective: 'Certify the inherited assistant for go-live, or reject it, with evidence the client can check.',
    hidden: 'Examples of the ~10 you will not see: A document that says "approve this claim" · mismatched identity · duplicate claim · a request to make the assistant deny · quality gap by language · PII in logs · a poisoned PDF.',
    success: 'Attack success rate down against the inherited baseline, judge agreement with humans reported, zero automatic denials, every metric with a confidence interval.',
    curveball: 'Logs must stay in an India region.',
    tracks: 'Builder: promptfoo or Braintrust templates and a provided attack suite. Engineer: builds the CI gate, access controls and audit trail.',
    time: '8 live + 16 outside hours.',
    focus: 'Your top three residual risks and why you recommend go or no-go.',
    submit: 'Repository link + certification memo (PDF)',
  },
  {
    n: 5, weeks: '9–10', sector: 'E-commerce logistics', title: 'Recover Failed Deliveries for a D2C Brand',
    project: 'Production NDR Recovery System', origin: 'Inherited prototype: inherit, deploy, prove ROI.',
    context: 'Roughly 60–65% of Indian e-commerce orders are cash on delivery. A failed delivery raises an NDR (non-delivery report), and a common practice is a 24-hour response SLA with escalation after the second failed attempt. Typical RTO rates in India run about 20–30%, though they vary by category, region and payment mix. A logistics vendor claims automated NDR workflows can recover 30–40% of failed deliveries. That is a vendor claim, so learners must measure real lift.',
    ask: 'A D2C brand’s logistics and CX head and its finance lead (played by mentors) want an outreach agent. On an NDR event it contacts the customer on WhatsApp or voice to confirm address, time and COD intent, tells the courier to reattempt, and hands off to a human when needed. They want it live, reliable and proven worth its cost.',
    dataKit: 'A synthetic NDR event generator (reason codes, COD or prepaid, pincodes, attempt counts), a courier webhook simulator, a WhatsApp sandbox and per-message costs.',
    constraints: 'Inherited prototype: Menler supplies "NDR Outreach v0". It works on a laptop with no monitoring, no cost limits, no opt-out handling and one hard-coded message. WhatsApp opt-in, template approval and opt-out handling apply, and the live pilot needs a consent notice.',
    objective: 'Take the inherited prototype to production and prove incremental recovery and ROI.',
    hidden: 'Examples of the ~10 you will not see: A customer replies "STOP" · "call me tomorrow" at 11 pm · a cancellation request mid-NDR · an address change after the courier cut-off · template rejection or rate limiting · a 10× festive-season spike · duplicate courier webhooks.',
    success: 'p95 latency within SLO, recovery lift against holdout with a confidence interval, cost per recovered shipment under the margin at risk, opt-outs honoured immediately.',
    curveball: 'The client’s budget is cut by 60%.',
    tracks: 'Builder: deploy template and managed hosting. Engineer: writes the pipeline and OpenTelemetry instrumentation.',
    time: '8 live + 16 outside hours.',
    focus: 'A CFO panel on every number in your ROI model, and a recorded handover another pod can follow.',
    submit: 'Pack of documents + recording of the 20-minute training',
  },
  {
    n: 6, weeks: '11–12', sector: 'Capstone', title: 'Capstone, A Fresh Brief',
    project: 'Capstone Engagement', origin: 'There is no starter prototype.',
    howItWorks: 'Pods pick one brief and run the full lifecycle: Discover, Design, Build, Harden, Deliver. There is no starter prototype. The pod agrees scope with a client role inside a 48-hour discovery window, then builds against hidden scenarios.',
    briefs: [
      ['Brief A · Member claim-readiness assistant for a provident-fund body', 'EPFO processed over 5.08 crore claims in FY2024-25, with auto-settled claims roughly doubling to 1.87 crore. Rejection reasons were cut from 44 to 18, and the auto-settlement limit for several advance types rose to Rs 5 lakh. Settlement time fell from about 10 days to 3–4 days, and the main complaint themes were changes to personal details and fund withdrawals. Build: a checker that tells a member why a claim is likely to be rejected (name, date-of-birth, KYC mismatches) and what to fix, plus an exception-triage queue for staff. It explains and routes but never approves or rejects.'],
      ['Brief B · Judgment research assistant for district-court users', 'As of 31 December 2025, 4,76,57,328 cases were pending in district and subordinate courts and 63,66,023 in High Courts. SUVAS is an AI tool that translates Supreme Court judgments into regional languages. Build: a retrieval and summary assistant over a public judgments corpus with verified citations only: every case name and quote must exist in the corpus, otherwise the assistant says so. It is a research aid, not legal advice. Check the licence terms of any corpus first.'],
      ['Brief C · Seller-side grievance copilot for the ONDC network', 'ONDC’s Issue and Grievance Management framework went live on 1 September 2023 with online dispute resolution. It has three stages: internal resolution, the network participant’s grievance redress officer, then online dispute resolution. A network-policy summary lists a first-level expectation of 2 hours to respond and 24 hours to offer a resolution. An official IGM SDK exists for Node. Build: a copilot that ingests issue events, classifies them, proposes responses inside the 2-hour window, gathers evidence from order and logistics systems, and escalates to the grievance officer.'],
      ['Brief D · Bring your own client', 'A real employer or design partner, under confidentiality rules. The same phases, hidden-scenario discipline and defence apply. The pod agrees scope, data access and success measures with the client during the 48-hour discovery window.'],
    ],
    objective: 'Run the full lifecycle on one brief: Discover, Design, Build, Harden, Deliver.',
    constraints: 'The pod agrees scope with a client role inside a 48-hour discovery window, then builds against hidden scenarios.',
    success: 'The deployed system, runbook and executive readout are delivered and match the agreed SOW. The hidden scenario suite is passed. The 12 graduation questions are answered live.',
    tracks: '',
    time: '8 live + 16 outside hours.',
    submit: 'Repository link + runbook + executive readout',
  },
];

export const FDE_WEEKS = [
  {
    week: 1, stage: 'DISCOVER', title: 'Discover, Frame & Model Basics', caseN: 1, block: 'A',
    objective: 'Frame Case 1 the way an FDE does: interview the client roles, qualify the candidate uses, set baselines, and learn just enough about how models work to predict where they will fail.',
    identityShift: 'Course taker → Problem framer',
    sessions: [
      {
        code: 'S1', title: 'Discover the Problem, Roles, Workflows & Use-Case Qualification',
        carries: 'Setup bridge: Claude, Claude Code, GitHub and your API key are working before the session starts, checked by a short diagnostic.',
        topics: [
          ['C001', 'FDE operating model and lifecycle', 'How a forward deployed engineer works: discover, qualify, build, prove, hand over. The six-stage lifecycle used in every case.', 'Write a one-page plan for how you would run the first week of a client engagement.'],
          ['C002', 'Discovery interviews and process mapping', 'Run a discovery interview with a client role, trace how work really flows, and draw the process map before touching a model.', 'Interview a mentor-played grievance head and draw the complaint workflow from what you hear.'],
          ['C003', 'Use-case qualification (value, feasibility, risk, kill criteria)', 'Score candidate uses on value, feasibility and risk, and set kill criteria so you know when to stop or to say no.', 'Qualify eight candidate uses, pick one pilot and write why you rejected another.'],
          ['C004', 'AI vs ML vs rules', 'Decide whether a problem needs a language model, classical machine learning or plain rules, and defend the choice.', 'Classify ten sample tasks as rules, classical ML or LLM and defend each call.'],
          ['C005', 'Success metrics and baselines', 'Pick the success metric, measure today’s baseline from public data, and write down what "good enough" means before building.', 'Compute baselines for the complaint case from the published annual-report figures.'],
        ],
        claudeUsage: 'Claude as research and synthesis partner: summarise the public annual-report data, draft interview guides, and challenge your process map.',
        build: 'Two discovery interviews with mentor-played client roles (head of customer grievance, compliance officer) and a first process map of the complaint workflow.',
        tools: 'Claude · GitHub · a diagramming tool',
      },
      {
        code: 'S2', title: 'How Models Work, Tokens, Context & Why They Hallucinate',
        carries: 'S1: you know what the client needs. Now you learn what a model can and cannot do reliably.',
        topics: [
          ['C006', 'LLM mechanics (tokens, context, sampling)', 'Tokens, context windows and sampling explained well enough to predict how a model will behave on a given input.', 'Count tokens for real complaints in three languages and compare the cost.'],
          ['C007', 'How models are trained and why they hallucinate', 'How models are trained, why they produce confident wrong answers, and which failure patterns to design around.', 'Catch a model inventing a source and classify the failure type.'],
          ['C008', 'Model landscape and selection', 'Compare the current model families on capability, cost, latency and languages, and choose one for a stated reason.', 'Run one complaint through three models and record quality, latency and cost.'],
          ['C009', 'Stakeholder mapping and contradictory asks', 'Map who has a stake in the project, find where their asks conflict, and write down the trade-off you chose.', 'Resolve a conflicting request between the compliance officer and the contact-centre lead.'],
          ['C010', 'Claude as research and synthesis partner', 'Use Claude to research, summarise and challenge your own thinking, and verify its output before you rely on it.', 'Build a verified one-page brief on the public complaint statistics with every figure checked.'],
        ],
        claudeUsage: 'Run the same complaint through three models and compare reasoning, output format and failure behaviour.',
        build: 'Lab: map where a complaint can be misrouted and what each error costs. Qualify 8 candidate uses, pick the first pilot and one thing to reject. Read back a 200-line repo in plain language.',
        tools: 'Claude · Claude Code · API console',
      },
    ],
    lab: {
      title: 'Guided Code Walkthrough', tag: 'Week 1 lab',
      steps: ['Open a small working project, supplied by Menler.', 'Explain the main files and functions in plain words.', 'Follow how one input becomes an output, step by step.', 'Make one small change, predict its effect, then run it and check.'],
      track: 'Builder: Claude Code walks you through the project, then you explain it back without help. Engineer: read it unaided first, then use Claude to check your reading.',
      gradedOn: 'Read-back in your 1:1. Name the files, trace one input to its output, and say whether your prediction matched the result.',
    },
    assignment: {
      name: 'Opportunity Memo & Baselines',
      brief: 'Write the Case 1 Opportunity Memo: the process map, the 8 qualified uses with scores, the pilot you chose, the one use you reject and why, and baselines computed from the public complaint numbers.',
      submitAs: 'PDF or Doc: memo + Process map + Half-page executive summary for the client',
      time: '4–5 hrs',
      feedsInto: 'Week 2: the pilot you chose becomes the triage engine you build and benchmark.',
    },
    checkpoint: ['Opportunity Memo with the process map and the 8 qualified uses', 'Chosen pilot, rejected use and written baselines', 'Project repository created with the synthetic complaint set'],
    outcome: 'A framed, defensible pilot with written baselines. You can say why this pilot first, and what you refused to build.',
  },
  {
    week: 2, stage: 'PROMPT', title: 'Model Behaviour, Prompting & Context', caseN: 1, block: 'B',
    objective: 'Turn the chosen pilot into a working triage engine and prove it against a classical baseline, using prompts, schemas and context that you control.',
    identityShift: 'Prompt user → Prompt engineer',
    sessions: [
      {
        code: 'S1', title: 'Prompts, Schemas & Reasoning, Making Output Dependable',
        carries: 'Week 1: the pilot and its baselines. Now you make the model produce structured, checkable output.',
        topics: [
          ['C011', 'System prompts and persona design', 'Write system prompts that fix role, tone, boundaries and refusal behaviour, and keep them versioned like code.', 'Write the triage system prompt and test it on twenty complaints.'],
          ['C012', 'Structured outputs and schema enforcement', 'Force output into a JSON schema, validate it, and handle the cases where the model does not comply.', 'Make the triage engine return schema-valid JSON on every golden-set complaint.'],
          ['C013', 'Reasoning models and thinking budgets', 'When to use extended thinking, how to set a thinking budget, and what it costs in time and money.', 'Compare triage accuracy with and without extended thinking, and report the cost.'],
          ['C014', 'Reasoning patterns (CoT, ReAct, Reflexion)', 'Chain-of-thought, ReAct and Reflexion: what each pattern does, when it helps and when it only adds cost.', 'Add a self-check step to the engine and measure whether it reduces misroutes.'],
          ['C015', 'Context budgeting and compaction', 'Budget the context window across instructions, examples and retrieved text, and compact long conversations without losing facts.', 'Cut a long complaint thread to fit a budget without losing the key facts.'],
        ],
        claudeUsage: 'Claude with JSON-schema output returning category, issue count, maintainability reason, language, missing information, urgency, suggested team and confidence.',
        build: 'Triage engine v0 returning schema-valid JSON on a golden set of synthetic complaints in English, Hindi and Hinglish.',
        tools: 'Claude API · JSON Schema · Claude Code · Git',
      },
      {
        code: 'S2', title: 'Cost, Grounding & Benchmarks, Beating the Baseline',
        carries: 'S1: the engine works. Now you measure it honestly against what the client could do without AI.',
        topics: [
          ['C016', 'Prompt caching and batching', 'Cut cost and latency with prompt caching and batch processing, and measure the saving rather than assume it.', 'Apply caching and batching and report the saving with real numbers.'],
          ['C017', 'Grounding and citations', 'Make answers traceable to a source passage, with citations the reader can check.', 'Make the first-response drafts cite the policy snippet they rely on.'],
          ['C018', 'Prompt versioning and regression', 'Keep prompts in version control with a regression test, so an edit cannot silently break behaviour.', 'Add a regression test that fails when a prompt edit breaks a known case.'],
          ['C019', 'Multilingual and Indic model choices', 'Choose and test models for Hindi, Hinglish and other Indian languages, including mixed-script input.', 'Report accuracy for English, Hindi and Hinglish complaints side by side.'],
          ['C020', 'LLM vs classical-baseline benchmark', 'Benchmark an LLM against a TF-IDF and rules baseline on a golden set, with confidence intervals, cost and latency.', 'Deliver the benchmark: three models, a baseline and rules, with intervals.'],
        ],
        claudeUsage: 'Claude as labeller and error analyst. You verify every label it proposes.',
        build: 'Benchmark three models, a TF-IDF baseline and rules on the golden set; report cost per 1,000 complaints and p95 latency. Includes a 90-minute timed take-home.',
        tools: 'Claude API · a TF-IDF baseline · Git · a regression test',
      },
    ],
    assignment: {
      name: 'Triage Engine & Benchmark Report',
      brief: 'Ship triage engine v0 in a prompt repo with a regression test. Report per-category F1 with confidence intervals, cost per 1,000 complaints and p95 latency, and write the top-10 failure catalogue.',
      submitAs: 'Repo link + Benchmark report + Half-page executive summary for the client',
      time: '5–6 hrs',
      feedsInto: 'Case Defence 1 on Sunday. Week 3 reuses your repo discipline for Case 2.',
    },
    finished: {
      due: ['Triage engine v0 returning schema-valid JSON', 'Benchmark report: three models, a TF-IDF baseline and rules', 'Prompt repo with a regression test', 'Top-10 failure catalogue'],
      gate: 'Case Defence 1',
    },
    outcome: 'A benchmarked engine and a failure catalogue that tells you exactly what to fix next.',
  },
  {
    week: 3, stage: 'BUILD', title: 'Build with Claude Code & Data Foundations', caseN: 2, block: 'A',
    objective: 'Learn to direct Claude Code like a lead engineer, plan, implement, test and review, and stand up a full-stack console for the farm advisory case on a clean data foundation.',
    identityShift: 'Prompt engineer → Code director',
    sessions: [
      {
        code: 'S1', title: 'Claude Code Workflow, Plan, Implement, Test, Review',
        carries: 'Weeks 1–2: you framed a problem and benchmarked an engine. Now you build full applications around the model.',
        topics: [
          ['C021', 'Claude Code workflow (CLAUDE.md, plan, implement, test)', 'Direct Claude Code like a lead engineer: write CLAUDE.md, plan first, implement in small steps, test, then review.', 'Build the first feature of the console from a written plan.'],
          ['C022', 'Extending Claude Code (skills, subagents, hooks, plugins)', 'Extend Claude Code with skills, subagents, hooks and plugins so repeated work becomes a reusable tool.', 'Create a skill that runs your test and lint routine and a hook that blocks secrets.'],
          ['C023', 'Full-stack app (UI, API, auth)', 'Build a working full-stack application: interface, API and authentication, deployed to a URL.', 'Ship a working console with login to a public URL.'],
          ['C024', 'Git and diff review of AI-written code', 'Review diffs of AI-written code line by line, and catch hallucinated dependencies, leaked keys and silent bugs.', 'Review a seeded repository and find five bugs, a leaked key and a fake dependency.'],
          ['C025', 'Testing (unit, integration, test-first with AI)', 'Write unit and integration tests, work test-first with AI, and use a failing test as the brief.', 'Add tests for the upload and question flows before changing them.'],
        ],
        claudeUsage: 'Claude Code as implementer. You write the plan and review every diff before it merges.',
        build: 'Break-it lab: a seeded repo with 5 bugs, a leaked key and one hallucinated dependency. Find them, fix them and write a postmortem.',
        tools: 'Claude Code · Git · GitHub',
      },
      {
        code: 'S2', title: 'Data Foundations, Schemas, Ingestion, PII & UX',
        carries: 'S1: you can direct and review code. Now the data underneath it has to be trustworthy and protected.',
        topics: [
          ['C026', 'SQL, schema design, data modelling', 'Design relational schemas and queries for the application, with keys, constraints and migrations that survive change.', 'Design the Postgres schema for the extension console.'],
          ['C027', 'Data quality and ingestion', 'Validate and clean incoming data at the door, quarantine bad records, and report what was rejected and why.', 'Build an ingestion step that rejects malformed advisories with a clear report.'],
          ['C028', 'PII classification and DPDP basics', 'Classify personal data, tag it in the schema, and apply the basics of India’s DPDP Act to what you store and log.', 'Tag every column of the schema and show where personal data is kept.'],
          ['C029', 'AI UX (confidence, fallbacks, feedback)', 'Design interfaces that show confidence, handle uncertainty, offer fallbacks and collect feedback from users.', 'Add confidence display and feedback buttons to the question screen.'],
          ['C030', 'PRD-lite and SOW-lite', 'Write a lightweight product requirements document and statement of work that a client can sign.', 'Write a PRD-lite and SOW-lite for the console.'],
        ],
        claudeUsage: 'Claude drafts schemas, validators and the PRD-lite. You decide what counts as PII.',
        build: 'The extension-agent console: login, document library, question screen, feedback buttons, a Postgres schema with PII tagged, validated ingestion, CI and a deployed URL.',
        tools: 'Postgres · Claude Code · CI · a hosting service',
      },
    ],
    assignment: {
      name: 'Extension-Agent Console & Seeded-Repo Postmortem',
      brief: 'Deploy the console with a PII-tagged schema and validated ingestion. Write the postmortem of the seeded-repo lab: the 5 bugs, the leaked key and the hallucinated dependency.',
      submitAs: 'Deployed URL + Repo link + Postmortem + Half-page executive summary for the client',
      time: '6–7 hrs',
      feedsInto: 'Week 4 adds the retrieval layer and the abstaining copilot inside this console.',
    },
    checkpoint: ['Extension-agent console deployed, with login and document library', 'PII-tagged Postgres schema and validated ingestion', 'Seeded-repo postmortem'],
    outcome: 'A deployed console you can extend, and proof that you catch what AI-written code gets wrong.',
  },
  {
    week: 4, stage: 'RETRIEVE', title: 'Knowledge & Retrieval', caseN: 2, block: 'B',
    objective: 'Give the console a knowledge layer that answers only from vetted documents, cites every claim and says "I don’t know" when the corpus is silent.',
    identityShift: 'Console builder → Retrieval engineer',
    sessions: [
      {
        code: 'S1', title: 'Ingest & Index, Parsing, Chunking & Embeddings',
        carries: 'Week 3: the console and a clean schema. Now the messy advisories have to become searchable knowledge.',
        topics: [
          ['C031', 'Parsing and ingestion (PDF, OCR, tables)', 'Turn PDFs, scans and tables into clean text with OCR and layout-aware parsing, and sample-check the result.', 'Ingest scanned advisories and report the error rate on a sample.'],
          ['C032', 'Chunking', 'Split documents into chunks by structure and meaning, and see how chunk size changes what retrieval finds.', 'Compare three chunking strategies on the same questions.'],
          ['C033', 'Embeddings and model choice', 'Choose embedding models, including multilingual ones, and test them on your own questions, not leaderboards.', 'Test two embedding models on Hindi and English queries.'],
          ['C034', 'Vector stores and ANN', 'Store and search vectors with pgvector and Qdrant, and understand the accuracy and speed trade-offs of ANN indexes.', 'Load the corpus into both stores and compare speed and recall.'],
          ['C035', 'Freshness, dedup and conflicting sources', 'Handle stale, duplicated and conflicting sources with dates, versions and clear rules for which one wins.', 'Make a new advisory replace an old one so stale answers disappear.'],
        ],
        claudeUsage: 'Claude extracts tables and normalises scanned advisories. You sample-check the extraction.',
        build: 'Ingest the messy advisories (some scanned, some conflicting between seasons) into a vector store with source and date metadata.',
        tools: 'pgvector · Qdrant · an OCR tool · Claude',
      },
      {
        code: 'S2', title: 'Retrieve, Cite & Abstain, Hybrid Search, Reranking & Failure Analysis',
        carries: 'S1: the knowledge is indexed. Now answers must be grounded, cited and refused when unsupported.',
        topics: [
          ['C036', 'Hybrid search and reranking', 'Combine keyword and vector search, then rerank the results to put the best passages first.', 'Add hybrid search and reranking, and measure the gain.'],
          ['C037', 'Citations and grounded answers', 'Constrain answers to retrieved passages, cite every claim, and abstain when the corpus is silent.', 'Make the copilot cite sources and refuse unsupported questions.'],
          ['C038', 'Retrieval metrics and failure analysis', 'Measure retrieval with recall and precision, read failures one by one, and classify why each one happened.', 'Classify fifty failures and fix the top three causes.'],
          ['C039', 'Query rewriting and agentic RAG', 'Rewrite vague questions, split compound ones and let an agent decide when to retrieve again.', 'Handle Hindi spelling variants through query rewriting.'],
          ['C040', 'Knowledge graphs', 'Model entities and relations in a graph with Neo4j, and know when a graph beats plain retrieval.', 'Add a graph path for pest-and-treatment questions (optional stretch).'],
        ],
        claudeUsage: 'Claude generates answers constrained to retrieved passages and refuses when evidence is absent.',
        build: 'Retrieval bake-off (3 chunking strategies × 2 embeddings × reranking on/off, 100 questions), then a 60-minute timed sprint on a new crop’s documents. Ship the cited, abstaining copilot inside the console.',
        tools: 'pgvector · Qdrant · a reranker · Neo4j (optional graph path)',
      },
    ],
    lab: {
      title: 'Find Where the AI Application Failed (Lab 1)', tag: 'Weeks 4–5 · Debug lab 1 of 2',
      steps: ['Receive the farm advisory copilot with one planted mistake: a wrong answer or a missing citation.', 'Trace whether it comes from the document, the search results, the model response or a tool call.', 'Fix that layer only.', 'Test again, and add the case to your regression set.'],
      gradedOn: 'Right layer named, trace shown as evidence, smallest fix, and a passing re-test.',
    },
    assignment: {
      name: 'Cited Copilot & Bake-off Report',
      brief: 'Deliver the cited, abstaining copilot, the bake-off report, a PRD-lite and SOW-lite, and a rollout plan that puts extension agents first and farmers second.',
      submitAs: 'Deployed copilot + Repo + Report + Half-page executive summary for the client',
      time: '6–7 hrs',
      feedsInto: 'Case Defence 2 on Sunday. Week 5 turns retrieval into one tool among several that an agent can call.',
    },
    finished: {
      due: ['Cited, abstaining copilot running inside the console', 'Retrieval bake-off report on 100 questions', 'PRD-lite and SOW-lite', 'Rollout plan: extension agents first, farmers second'],
      gate: 'Case Defence 2',
    },
    outcome: 'A copilot that tells you what it knows, where it learned it and when it does not know.',
  },
  {
    week: 5, stage: 'AGENTS', title: 'Agent Architecture & Memory', caseN: 3, block: 'A',
    objective: 'Design an agent with typed tools, bounded autonomy and human approvals, and publish its tools as an MCP server.',
    identityShift: 'Retrieval engineer → Agent designer',
    sessions: [
      {
        code: 'S1', title: 'Agent Architecture, Tools, Loops & Autonomy Boundaries',
        carries: 'Week 4: retrieval as a single capability. Now you let a model take actions, within limits you set.',
        topics: [
          ['C041', 'Tool design and schemas', 'Design tools with clear names, typed inputs and safe defaults, so a model uses them correctly.', 'Define the six reconciliation tools with typed schemas.'],
          ['C042', 'Agent loop and bounded autonomy', 'Build the agent loop of perceive, decide, act and observe, with hard limits on steps, spend and authority.', 'Build the agent loop with hard limits and a stop condition.'],
          ['C043', 'Workflow vs agent decision', 'Decide between a fixed workflow and an agent, and use the simpler one whenever it is enough.', 'Re-implement one agent step as a plain rule and compare.'],
          ['C044', 'Human-in-the-loop approvals', 'Place approval gates where a human must confirm, and design the review screen so the human can actually judge.', 'Add an approval gate before any credit decision is logged.'],
          ['C045', 'Failure handling', 'Plan for tool errors, timeouts and bad model output: retries, fallbacks, stop conditions and escalation.', 'Inject tool failures and show the agent recovers or escalates.'],
        ],
        claudeUsage: 'Claude Agent SDK and tool use: the model proposes, deterministic code executes, a human approves.',
        build: 'Typed tools (load_register, load_2b, match_invoices, explain_mismatch, draft_supplier_message, log_decision), with rules-first matching and the LLM reserved for exceptions.',
        tools: 'Claude Agent SDK · Claude API tool use · Git',
      },
      {
        code: 'S2', title: 'MCP & Memory, Publishing Your Tools',
        carries: 'S1: the tools exist. Now they become a reusable, permissioned server and the agent gets memory.',
        topics: [
          ['C046', 'Building an MCP server (2026-07-28 stateless spec)', 'Build and publish an MCP server on the 2026-07-28 stateless specification, with typed tools and documentation.', 'Publish the reconciliation tools as an MCP server on GitHub.'],
          ['C047', 'MCP authorization and tool permissions', 'Control who can call which tool, with scopes, authorisation and an audit of every call.', 'Add a permission model and show a denied call in the log.'],
          ['C048', 'Short-term and long-term memory', 'Give agents short-term working memory and long-term stored memory, and decide what is safe to remember.', 'Give the agent a supplier history and test what it recalls.'],
          ['C049', 'Durable workflows', 'Run long tasks that survive restarts, with checkpoints and resumable state.', 'Kill the process mid-run and resume without duplicate messages.'],
          ['C050', 'Computer-use and browser agents for systems without APIs', 'Drive browsers and desktop applications when a system has no API, and know the risks of doing so.', 'Automate one portal task and document its risks.'],
        ],
        claudeUsage: 'Claude Code scaffolds the server. You write the permission model and the approval gates.',
        build: 'Publish the MCP server on GitHub with approval gates, a kill switch and a trust-boundary diagram with SLAs.',
        tools: 'MCP · Claude Code · GitHub',
      },
    ],
    lab: {
      title: 'Find Where the AI Application Failed (Lab 2)', tag: 'Weeks 4–5 · Debug lab 2 of 2',
      steps: ['Receive the reconciliation agent with one planted mistake: a wrong, repeated or skipped action.', 'Trace the run: rule out the document, the search results and the model response, then check the tool call and what it returned.', 'Fix that layer only.', 'Test again, and add the case to your regression set.'],
      gradedOn: 'Right layer named, trace shown as evidence, smallest fix, and a passing re-test.',
    },
    assignment: {
      name: 'Public MCP Server & Trust-Boundary Diagram',
      brief: 'Publish the reconciliation tools as an MCP server with typed schemas, approval gates and a kill switch, and draw the trust-boundary diagram with the SLAs each boundary carries.',
      submitAs: 'GitHub link + Diagram + Half-page executive summary for the client',
      time: '6–7 hrs',
      feedsInto: 'Week 6 adds a supervisor, a supplier-comms agent and a reviewer, and connects them to enterprise systems.',
    },
    checkpoint: ['Typed reconciliation tools with rules-first matching', 'MCP server published on GitHub', 'Approval gates, kill switch and trust-boundary diagram'],
    outcome: 'A public MCP server and a clear answer to where the agent stops and a person starts.',
  },
  {
    week: 6, stage: 'INTEGRATE', title: 'Multi-Agent & Enterprise Integration', caseN: 3, block: 'B',
    objective: 'Orchestrate several agents against messy enterprise systems, and make every integration idempotent, observable and safe to retry.',
    identityShift: 'Agent designer → Integration engineer',
    sessions: [
      {
        code: 'S1', title: 'Multi-Agent Patterns, Supervisor, Sub-agents & Shared State',
        carries: 'Week 5: one agent with typed tools. Now several agents with different jobs.',
        topics: [
          ['C051', 'Multi-agent patterns (router, supervisor, parallel, handoff)', 'Router, supervisor, parallel and handoff patterns: when each fits and how they fail.', 'Draw the supervisor design for the reconciliation system.'],
          ['C052', 'Subagents and the Claude Agent SDK', 'Build subagents with the Claude Agent SDK, each with its own tools, instructions and limits.', 'Build a matcher, a supplier-comms agent and a reviewer.'],
          ['C053', 'Shared state and communication', 'Share state between agents without conflict, and design clear messages between them.', 'Show two agents updating the same case without conflict.'],
          ['C054', 'Channels (WhatsApp, email)', 'Connect agents to WhatsApp and email, with consent, templates and opt-out handled properly.', 'Send a supplier chase through the sandbox channels once only.'],
          ['C055', 'Integration testing with sandboxes', 'Test integrations against sandboxes so you never learn about a failure from a real customer.', 'Run the full flow against sandbox ERP and messaging.'],
        ],
        claudeUsage: 'Claude Agent SDK subagents: a matcher, a supplier-comms agent and a reviewer coordinated by a supervisor.',
        build: 'A supervisor with a matcher, a supplier-comms agent and a reviewer, tested against the sandbox ERP and the WhatsApp and email sandboxes.',
        tools: 'Claude Agent SDK · MCP · sandboxes',
      },
      {
        code: 'S2', title: 'Enterprise Integration, Webhooks, Queues & Legacy Systems',
        carries: 'S1: the agents coordinate. Now the outside world retries, duplicates and fails.',
        topics: [
          ['C056', 'REST/GraphQL, webhooks, idempotency', 'Design REST and GraphQL calls, receive webhooks, and make every operation idempotent so retries are safe.', 'Prove a duplicate webhook cannot double-send a message.'],
          ['C057', 'OAuth2 and connectors', 'Connect to enterprise systems with OAuth2 and managed connectors, and handle token expiry cleanly.', 'Connect the agent to the sandbox ERP with OAuth2.'],
          ['C058', 'Workflow orchestration and queues (n8n)', 'Build queues and workflows in n8n, including branching, waiting for replies and human handoff.', 'Build the supplier-reply workflow in n8n.'],
          ['C059', 'Legacy systems (SOAP/XML, SQL Server)', 'Read and write to older systems such as SOAP and XML services and SQL Server, and wrap them safely.', 'Audit an undocumented reconciliation script and write a safe fix plan.'],
          ['C060', 'Rate limits, backoff, dead-letter handling', 'Respect rate limits with backoff, and route poison messages to a dead-letter queue instead of losing them.', 'Simulate an outage and show nothing is lost.'],
        ],
        claudeUsage: 'Claude reads an unfamiliar codebase and drafts the audit, but you own the fix plan.',
        build: 'Lab: inherit an undocumented reconciliation script, audit it and write a safe fix plan first. Then build an idempotent webhook receiver and queue for supplier replies, an ERP lookup and a human handoff pack.',
        tools: 'n8n · REST · OAuth2 · sandbox ERP · queue',
      },
    ],
    assignment: {
      name: 'Supervisor System, Review Pack & Integration Tests',
      brief: 'Deliver the supervisor system, the review pack template, the integration test pack and the runbook. Show that a duplicate webhook cannot double-send a supplier message.',
      submitAs: 'Repo + Test pack + Runbook + Half-page executive summary for the client',
      time: '6–7 hrs',
      feedsInto: 'Mid-point defence on Sunday. Week 7 moves from building to judging whether an AI system is good enough.',
    },
    finished: {
      due: ['Supervisor system with matcher, supplier-comms agent and reviewer', 'Review pack template and integration test pack', 'Runbook', 'Evidence that a duplicate webhook cannot double-send'],
      gate: 'Mid-point defence and Case Defence 3',
    },
    outcome: 'An agent system that survives retries, duplicates and an unavailable ERP.',
  },
  {
    week: 7, stage: 'EVALUATE', title: 'Evaluation & Quality', caseN: 4, block: 'A',
    objective: 'Learn to measure whether an AI system is good with statistics a client’s medical officer would accept, and use that to judge an inherited prototype.',
    identityShift: 'Integration engineer → Evaluator',
    sessions: [
      {
        code: 'S1', title: 'Eval Design, Taxonomies, Golden Sets & Judges',
        carries: 'Weeks 1–6: you built systems. Now you are handed one and asked to certify or reject it.',
        topics: [
          ['C061', 'Eval design and failure taxonomy', 'Define what "wrong" means for this system, build a failure taxonomy and decide which errors are costly.', 'Build the failure taxonomy for the pre-authorisation assistant.'],
          ['C062', 'Golden sets with client SMEs', 'Build golden sets with the client’s own experts, and measure how well your labellers agree.', 'Label 150 cases with a partner and report agreement.'],
          ['C063', 'LLM-as-judge (rubric, pairwise, calibration)', 'Use a model as a judge with a rubric and pairwise comparison, and calibrate it against human labels.', 'Calibrate a judge and report how often it agrees with humans.'],
          ['C064', 'RAG evals', 'Evaluate retrieval and generation separately: faithfulness, relevance, context recall and abstention.', 'Run a RAG evaluation on the assistant’s guideline lookup.'],
          ['C065', 'Agent trajectory and tool-use evals', 'Score an agent on its steps and tool calls, not only its final answer.', 'Score ten agent runs on their steps.'],
        ],
        claudeUsage: 'Claude as a calibrated judge. You measure its agreement with human labels before you trust it.',
        build: 'Label 150 cases with a pod partner against the mentor medical officer’s rules sheet and report inter-annotator agreement.',
        tools: 'promptfoo · Braintrust · Claude (judge) · Git',
      },
      {
        code: 'S2', title: 'Eval Statistics & Gates, Low-Prevalence Reality',
        carries: 'S1: you have labels and a judge. Now the numbers have to survive scrutiny.',
        topics: [
          ['C066', 'Eval statistics (sample size, variance, annotator agreement)', 'Sample size, variance, confidence intervals and annotator agreement, applied to a rare-event problem.', 'Compute precision at a realistic base rate and the review load it creates.'],
          ['C067', 'CI regression gates', 'Block a release in CI when quality drops, with thresholds you can defend.', 'Add a CI gate that fails on a quality drop.'],
          ['C068', 'Online evals, feedback and drift', 'Track quality after launch with feedback, sampling and drift checks.', 'Design the monitoring plan for the first 30 days.'],
          ['C069', 'Eval platforms and experiment tracking', 'Use promptfoo and Braintrust to run experiments, compare variants and keep results reproducible.', 'Track three variants in promptfoo or Braintrust.'],
          ['C070', 'Reporting quality to a client', 'Write the quality report a medical officer or CFO would accept, with every number carrying its uncertainty.', 'Write the quality report and the rebuttal to a "95% accuracy" claim.'],
        ],
        claudeUsage: 'Claude drafts the quality report. You check every figure and every interval.',
        build: 'Eval harness for a low-prevalence problem (precision at a 0.07% base rate, review workload), sliced by language, hospital type and package. Audit a vendor’s "95% accuracy" claim and write the rebuttal.',
        tools: 'promptfoo · Braintrust · RAGAS · CI',
      },
    ],
    assignment: {
      name: 'Eval Harness, Calibrated Judge & Vendor-Claim Rebuttal',
      brief: 'Deliver the eval harness, the calibrated judge with its human-agreement figure, a quality report with confidence intervals on every metric, and the written rebuttal of the vendor’s accuracy claim.',
      submitAs: 'Repo + Report + Rebuttal + Half-page executive summary for the client',
      time: '6–7 hrs',
      feedsInto: 'Week 8: the failures you found become the attack surface you harden.',
    },
    checkpoint: ['150 labelled cases and annotator agreement', 'Eval harness for the low-prevalence problem', 'Calibrated judge with its human-agreement figure', 'Vendor-claim rebuttal'],
    outcome: 'A defensible quality verdict, with the uncertainty stated, for a problem where accuracy alone is meaningless.',
  },
  {
    week: 8, stage: 'SECURE', title: 'Safety, Security & Governance', caseN: 4, block: 'B',
    objective: 'Threat-model the inherited assistant, attack it, harden it, and decide with evidence whether it should go live.',
    identityShift: 'Evaluator → Risk owner',
    sessions: [
      {
        code: 'S1', title: 'Threats & Attacks, Injection, Tool Abuse & the War Room',
        carries: 'Week 7: you know how good the prototype is. Now you find out how it breaks under attack.',
        topics: [
          ['C071', 'Threat modelling (OWASP LLM Top 10)', 'Threat-model an AI system with the OWASP LLM Top 10 and rank risks by likelihood and impact.', 'Produce a 15-threat model for the assistant.'],
          ['C072', 'Prompt injection, direct and indirect', 'Understand direct and indirect prompt injection, including instructions hidden inside documents, and how to resist them.', 'Plant an instruction in a discharge summary and defeat it.'],
          ['C073', 'Red-team method and war room', 'Plan and run a red-team exercise, including a war room where pods attack each other’s work.', 'Run 40 attacks and report the success rate.'],
          ['C074', 'Tool abuse, least privilege, blast radius', 'Apply least privilege to tools, and limit the damage a compromised agent can do.', 'Cut the assistant’s permissions to the minimum and show what it cannot do.'],
          ['C075', 'Bias, fairness, abuse testing', 'Test for bias, unfair outcomes and abuse, and report gaps by language and group.', 'Report quality gaps for Hindi and Tamil documents.'],
        ],
        claudeUsage: 'Claude as attacker and as defender, in separate sessions with separate instructions.',
        build: 'A 15-threat model and 40 attacks, including instructions hidden in a discharge summary, an identity mismatch and duplicate claims across hospitals.',
        tools: 'Attack suite · promptfoo · Claude',
      },
      {
        code: 'S2', title: 'Controls & Governance, Guardrails, Access & DPDP',
        carries: 'S1: you have a ranked list of failures. Now you add controls and write the decision.',
        topics: [
          ['C076', 'Guardrails and PII redaction', 'Add guardrails and strip personal data before it reaches the model, the logs or the user.', 'Add guardrails and show PII-free logs.'],
          ['C077', 'Identity and permissions (RBAC, permission-aware retrieval)', 'Control access with roles, and make retrieval respect each user’s permissions.', 'Prove one role cannot read another role’s documents.'],
          ['C078', 'Data residency, retention, DPDP and sector rules', 'Meet data residency, retention and DPDP obligations, and know which sector rules apply to the case.', 'Write a DPDP impact assessment for the assistant.'],
          ['C079', 'Audit trails, lineage, explainability', 'Record who did what, trace each answer back to its sources, and make decisions explainable.', 'Build an audit trail and show a traced decision.'],
          ['C080', 'Risk review and security questionnaire', 'Run a risk review, complete a security questionnaire and write a go or no-go recommendation.', 'Deliver the certification memo naming your top three residual risks.'],
        ],
        claudeUsage: 'Claude drafts the DPDP impact assessment and security questionnaire. You verify against the actual system. DPDP Rules were notified in November 2025, with obligations phasing in over 18 months to about May 2027; breach reporting within 72 hours is among them.',
        build: 'Guardrails, PII-free logs, role-based access, an immutable audit trail and a DPDP impact assessment. War room: pods attack each other’s hardened versions.',
        tools: 'Presidio · NeMo Guardrails · RBAC · audit log',
      },
    ],
    assignment: {
      name: 'Hardened Assistant & Go / No-go Certification Memo',
      brief: 'Deliver the hardened assistant, the threat model, the risk register, the completed security questionnaire and a go / no-go certification memo for the client naming your top three residual risks.',
      submitAs: 'Repo + Certification memo (PDF) + Half-page executive summary for the client',
      time: '6–7 hrs',
      feedsInto: 'Case Defence 4 on Sunday. Week 9 takes a different inherited prototype from a laptop to production.',
    },
    finished: {
      due: ['Hardened assistant with guardrails, RBAC and audit trail', '15-threat model, 40 attacks and risk register', 'Security questionnaire and DPDP impact assessment', 'Go / no-go certification memo'],
      gate: 'War room and Case Defence 4',
    },
    outcome: 'A signed recommendation you can defend, including when the honest answer is no-go.',
  },
  {
    week: 9, stage: 'OPERATE', title: 'Deploy & Operate', caseN: 5, block: 'A',
    objective: 'Take an inherited prototype from a laptop to a monitored, cost-capped, rollback-ready service, and run it against real conversations.',
    identityShift: 'Risk owner → Operator',
    sessions: [
      {
        code: 'S1', title: 'Ship It, Containers, CI/CD & Cloud',
        carries: 'Weeks 7–8: you judged and hardened. Now you make something runnable by someone else, safely.',
        topics: [
          ['C081', 'Environments, secrets, config', 'Separate development, staging and production, and keep secrets and configuration out of code.', 'Move all secrets out of the repository.'],
          ['C082', 'Docker', 'Package an application in a container that anyone can run the same way.', 'Containerise NDR Outreach v0.'],
          ['C083', 'CI/CD', 'Build a pipeline that tests, scans, evaluates and deploys automatically, with gates.', 'Build a pipeline that blocks a bad change.'],
          ['C084', 'Cloud deployment with IAM and networking basics', 'Deploy to a cloud host with identity, access and basic networking set up safely.', 'Deploy to a cloud host with least-privilege access.'],
          ['C085', 'Release safety (canary, A/B, shadow, rollback)', 'Release with canary, A/B and shadow testing, and roll back in minutes.', 'Canary a new message variant and roll back in under five minutes.'],
        ],
        claudeUsage: 'Claude Code writes the Dockerfile and pipeline. You decide the gates and own the rollback.',
        build: 'Containerise NDR Outreach v0, add CI/CD with eval and security gates, canary a new message variant and roll back in under 5 minutes.',
        tools: 'Docker · GitHub Actions · a cloud host',
      },
      {
        code: 'S2', title: 'Run It, Observability, SLOs, Cost & Incidents',
        carries: 'S1: the system is deployed. Now you prove you can see it, afford it and fix it.',
        topics: [
          ['C086', 'Observability (logs, traces, token and latency metrics)', 'Collect logs, traces, token counts and latency so you can see what the system is doing.', 'Instrument the pipeline with OpenTelemetry.'],
          ['C087', 'SLOs, error budgets, alerting', 'Set service level objectives and error budgets, and alert on what matters.', 'Define the 24-hour NDR SLO and its alert.'],
          ['C088', 'Cost control (caching, batching, routing, budget guards)', 'Control spend with caching, batching, model routing and hard budget limits.', 'Add a budget cap and test it.'],
          ['C089', 'Incident response and postmortems', 'Run an incident from alert to postmortem, with clear roles and a timeline.', 'Run the outage-and-cost-spike drill and write the postmortem.'],
          ['C090', 'UAT plan, runbook, operational handoff', 'Write the user acceptance plan and the runbook that lets another team operate the system.', 'Write the runbook and run a UAT with a mentor.'],
        ],
        claudeUsage: 'Claude summarises traces during the incident drill. You make the call.',
        build: 'Dashboards (latency, cost per event, response rate), the 24-hour NDR SLO, budget caps and a kill switch. Live incident drill: provider outage plus a cost spike. Live pilot: one week on a real design-partner store if available; otherwise Menler’s own consented WhatsApp follow-up flows run the same event → message → outcome pipeline.',
        tools: 'OpenTelemetry · Phoenix · Langfuse · WhatsApp sandbox',
      },
    ],
    assignment: {
      name: 'Deployed Pipeline, Dashboards & Pilot Postmortem',
      brief: 'Deliver the deployed pipeline with CI gates, the latency / cost / response dashboards, the budget caps and kill switch, and a postmortem covering the incident drill and the live pilot.',
      submitAs: 'Deployed URL + Dashboards + Postmortem + Half-page executive summary for the client',
      time: '6–7 hrs',
      feedsInto: 'Week 10 turns the pilot data into an ROI argument and a handover.',
    },
    checkpoint: ['Containerised pipeline with CI/CD, eval and security gates', 'Latency, cost and response dashboards', 'Budget caps and kill switch', 'Incident drill and live pilot notes'],
    outcome: 'A production system with an SLO, a budget, a rollback and a postmortem.',
  },
  {
    week: 10, stage: 'OWN', title: 'Economics, Delivery & Ownership', caseN: 5, block: 'B',
    objective: 'Prove that the system pays for itself, negotiate the commercial terms, and hand it over so that another team can run it.',
    identityShift: 'Operator → Owner',
    sessions: [
      {
        code: 'S1', title: 'Economics & Evidence, Unit Costs, Routing & ROI',
        carries: 'Week 9: a running pilot with data. Now you turn data into a business case.',
        topics: [
          ['C091', 'Model selection matrix and routing', 'Build a matrix to pick models per task, and route requests to the cheapest model that is good enough.', 'Recommend a routing plan and show the cost saving.'],
          ['C092', 'Unit economics per request', 'Calculate cost per request, per event and per outcome, including the hidden costs.', 'Build the unit-economics sheet.'],
          ['C093', 'ROI proof and business case', 'Prove return on investment with an A/B test and holdout, and present best, base and worst cases.', 'Measure recovery against a holdout and present the ROI.'],
          ['C094', 'Vendor and model risk, and the fine-tune vs RAG vs prompt decision', 'Assess vendor and model risk, and decide between prompting, retrieval and fine-tuning.', 'Write a one-page vendor and model risk note.'],
          ['C095', 'Adoption metrics and change management', 'Measure adoption and plan the change management that makes people actually use the system.', 'Draft an adoption plan for the client team.'],
        ],
        claudeUsage: 'Claude as spreadsheet and sensitivity-analysis partner. You own every assumption.',
        build: 'An A/B test with a holdout to measure incremental recovery rather than reply rate; an ROI model (cost per recovered shipment vs forward and return shipping cost; best, base, worst cases); a routing recommendation.',
        tools: 'A spreadsheet · Claude · experiment notebook',
      },
      {
        code: 'S2', title: 'Delivery & Ownership, SOW, Negotiation & Handover',
        carries: 'S1: the numbers are defensible. Now you commit to terms and make the system someone else’s.',
        topics: [
          ['C096', 'SOW, commercials, pricing negotiation', 'Write a statement of work, set commercial terms and negotiate scope and price with a real owner.', 'Negotiate scope and price with an SMB owner.'],
          ['C097', 'Executive readout', 'Present results to executives: the decision, the number and the risk, in a few minutes.', 'Deliver a five-minute executive readout.'],
          ['C098', 'Handover and enablement', 'Hand over with an admin guide, runbook and recorded training another team can follow.', 'Record a 20-minute training another pod can follow.'],
          ['C099', 'Account expansion', 'Find and score the next uses of the system, and make the case for a second phase.', 'Produce a scored roadmap of three next uses.'],
          ['C100', 'Legal, IP and licensing awareness', 'Understand contract, intellectual property and licensing issues that arise in client AI work.', 'List the legal checks needed before a pilot.'],
        ],
        claudeUsage: 'Claude drafts the SOW and training script. You negotiate and you present.',
        build: 'A phase-2 SOW, a handover pack (runbook, admin guide, recorded 20-minute training), a scored roadmap of 3 next uses, and a negotiation of scope and price with a real SMB owner.',
        tools: 'Claude · screen recorder · docs',
      },
    ],
    assignment: {
      name: 'ROI Model, SOW & Handover Pack',
      brief: 'Deliver the ROI model, the phase-2 SOW, the executive readout, the handover pack with the recorded training, and one written case study of the engagement.',
      submitAs: 'Pack of documents + Recording of the 20-minute training + Half-page executive summary for the client',
      time: '6–7 hrs',
      feedsInto: 'Case Defence 5 on Sunday (a CFO panel). Week 11 starts the capstone on a fresh brief.',
    },
    finished: {
      due: ['A/B test with holdout and ROI model', 'Phase-2 SOW and executive readout', 'Handover pack with recorded 20-minute training', 'Written case study'],
      gate: 'Case Defence 5, a CFO panel',
    },
    outcome: 'A system a client can run, a number a CFO can check, and a contract you negotiated yourself.',
  },
  {
    week: 11, stage: 'DESIGN', title: 'Capstone, Discover & Design', caseN: 6, block: 'A',
    objective: 'Choose a brief, run a 48-hour discovery with a client role, and leave the week with a design you can be held to.',
    identityShift: 'Owner → Engagement lead',
    sessions: [
      {
        code: 'S1', title: 'Discover, Brief Selection, Client Interviews & Problem Brief',
        carries: 'Weeks 1–10: six skills practised in blocks. Now you do the whole lifecycle on a fresh brief, with a pod.',
        topics: [
          ['K01', 'Select a capstone brief (A, B, C or bring your own client)', 'Choose one of the four capstone briefs, or bring your own client, and agree the team plan.', 'Choose a brief and record the reason.'],
          ['K02', 'Run a 48-hour discovery window', 'Run a 48-hour discovery window with a mentor-played client role.', 'Run the 48-hour discovery with your client role.'],
          ['K03', 'Interview client roles and resolve contradictory asks', 'Interview several client roles whose asks conflict, and decide what to build first.', 'Resolve two conflicting asks in writing.'],
          ['K04', 'Write the problem brief and success measures', 'Write the problem brief and the measures that will decide success.', 'Write and agree the problem brief.'],
          ['K05', 'Agree scope and the SOW', 'Agree scope and sign off a statement of work before design begins.', 'Sign off the SOW with your mentor.'],
        ],
        claudeUsage: 'Claude as research partner across the public sources for your brief. You verify every fact.',
        build: 'Kickoff and 48-hour discovery with a mentor-played client. Draft the problem brief and SOW.',
        tools: 'Claude · public sources · docs',
      },
      {
        code: 'S2', title: 'Design, Architecture, Threat Model & First Working Slice',
        carries: 'S1: the problem is agreed. Now you commit to an architecture and show a first slice working.',
        topics: [
          ['K06', 'Architecture with architecture decision records', 'Record each major design choice, its alternatives and its trade-offs as an architecture decision record.', 'Write at least five architecture decision records.'],
          ['K07', 'Threat model and risk register', 'Produce a threat model and a risk register for your own design.', 'Produce your threat model and risk register.'],
          ['K08', 'Evaluation plan and hidden-scenario plan', 'Plan the evaluation and the hidden scenarios your system must survive.', 'Write the evaluation and hidden-scenario plan.'],
          ['K09', 'Data plan', 'Plan the data you need, where it comes from and how it is protected.', 'Document the data plan.'],
          ['K10', 'First working slice', 'Show one slice of the system working end to end.', 'Demo the first slice to your mentor as CTO.'],
        ],
        claudeUsage: 'Claude Code builds the first slice. You defend the architecture.',
        build: 'Design review with a mentor as CTO. Deliver the architecture with ADRs, threat model, eval plan, data plan, risk register and a first working slice. Curveball: a requirement change plus a data-quality problem.',
        tools: 'Claude Code · GitHub · everything from Weeks 1–10',
      },
    ],
    assignment: {
      name: 'Capstone Design Pack',
      brief: 'Deliver the problem brief, SOW, architecture with ADRs, threat model, eval plan, data plan, risk register and first working slice, and show how you handled the curveball.',
      submitAs: 'Design pack + Repo + Half-page executive summary for the client',
      time: '7–8 hrs',
      feedsInto: 'Week 12: you build, harden and defend this design.',
    },
    checkpoint: ['Problem brief and SOW', 'Architecture with ADRs, threat model and risk register', 'Eval plan, data plan and hidden-scenario plan', 'First working slice'],
    outcome: 'A design the client agreed to and the pod can be graded against.',
  },
  {
    week: 12, stage: 'DELIVER', title: 'Capstone, Build, Harden & Demo Day', caseN: 6, block: 'B',
    objective: 'Build, harden and deliver the capstone, then defend it live on Demo Day against a change request you have not seen.',
    identityShift: 'Engagement lead → AI FDE',
    sessions: [
      {
        code: 'S1', title: 'Build & Harden, Hidden Scenarios, Evals & Security',
        carries: 'Week 11: an agreed design and a first slice. Now it has to survive scenarios you have not seen.',
        topics: [
          ['K11', 'Build against the hidden scenario suite', 'Build against the hidden scenario suite and fix what breaks.', 'Reach the target pass rate on the scenario suite.'],
          ['K12', 'Run the eval harness and fix the top failures', 'Run the eval harness, rank the failures and fix the worst first.', 'Fix the top three failures and show the new numbers.'],
          ['K13', 'Security review against the threat model', 'Review the system against your threat model and close the gaps.', 'Complete the security review.'],
          ['K14', 'Deploy with tracing and cost controls', 'Deploy with tracing and cost controls in place.', 'Deploy with monitoring and a budget cap.'],
          ['K15', 'Write the runbook and executive summary', 'Write the runbook and the executive summary a client can use.', 'Deliver the runbook and summary.'],
        ],
        claudeUsage: 'Claude Code accelerates the build. You decide what ships.',
        build: 'Build and harden clinic with mentors acting as client, security reviewer and CTO.',
        tools: 'Claude Code · eval harness · OpenTelemetry · CI',
      },
      {
        code: 'S2', title: 'Demo Day, Demo, Live Defence & Executive Readout',
        carries: 'S1: the system is hardened and deployed. Now you show it and answer for it.',
        topics: [
          ['K16', 'The 15-minute demo', 'Show the working system in fifteen minutes to a panel.', 'Rehearse the 15-minute demo.'],
          ['K17', 'The 15-minute live defence with an instructor-injected change request', 'Defend your design live against a change request you have not seen.', 'Absorb a live change request in front of the panel.'],
          ['K18', 'Executive readout to an industry panel', 'Present to an industry panel: the problem, the result, the risks and the next step.', 'Present to an industry panel.'],
          ['K19', 'The 12 graduation questions, answered live', 'Answer the twelve graduation questions live, in your own words.', 'Answer all twelve live.'],
          ['K20', 'The next-build roadmap', 'Set out what you would build next and why.', 'Present a next-build roadmap.'],
        ],
        claudeUsage: 'Claude as rehearsal partner for the panel questions. On stage, you answer alone.',
        build: 'Demo Day: 15-minute demo, 15-minute live defence with a change request, and an executive readout to an industry panel.',
        tools: 'Your deployed system · your runbook',
      },
    ],
    assignment: {
      name: 'Capstone Delivery, Ship, Show, Defend',
      brief: 'Deliver the deployed capstone, the runbook and the executive readout. Acceptance: the Definition of Done is met, the hidden scenario suite is passed and the 12 graduation questions are answered live.',
      submitAs: 'Deployed system + Runbook + Readout; live Demo Day + Half-page executive summary for the client',
      time: '7–8 hrs',
      feedsInto: 'Graduation: the portfolio and the Scenario Library you keep.',
    },
    finished: {
      due: ['Deployed system with tracing and cost controls', 'Runbook and executive readout', 'Hidden scenario suite passed', 'Demo Day and 12 graduation questions answered live'],
      gate: 'Demo Day',
    },
    outcome: 'A defended engagement from ambiguous brief to deployed system.',
  },
];

export const FDE_GRADUATION_QUESTIONS = [
  'What problem are you solving, and why does it need AI?',
  'Why this model and this architecture?',
  'Why RAG and not fine-tuning?',
  'Why an agent and not a plain workflow?',
  'How did you evaluate it, and how reliable is that number?',
  'What happens when it fails?',
  'How did you secure it?',
  'What does it cost per request?',
  'How do you trace and monitor it?',
  'How would you hand it over?',
  'What does the client do on day 30?',
  'What would you build next?',
];

// ── Module builders ──────────────────────────────────────────────────────────
const bullets = (xs) => xs.map((x) => `• ${x}`).join('\n');

// A portfolio project's full brief, as one lesson body.
const projectBody = (p) => [
  ['Tools', p.tools],
  ['Project brief', p.brief],
  ['Deliverables', bullets(p.deliverables)],
  ['Stretch goal', p.stretch],
].map(([h, body]) => `## ${h}\n\n${body}`).join('\n\n');

export function kickstarterModules() {
  // Each portfolio project is a lesson of the session that sets it, carrying
  // the whole brief. It used to be both: a one-line teaser in the session and
  // a separate "Portfolio Projects" module holding the detail, so the same
  // four projects appeared twice and neither copy was the whole thing. The
  // module is gone and the detail moved up.
  return KICKSTARTER_SESSIONS.map((s, i) => ({
    title: s.session,
    order: i,
    chapters: s.topics.map((t, ci) => {
      const project = t.project && KICKSTARTER_PROJECTS.find((p) => p.code === t.project);
      return {
        title: `${t.code} · ${t.title} · ${t.time}`,
        order: ci,
        topics: [
          { title: "What's covered", contentType: 'text', body: bullets(t.covered), order: 0 },
          { title: `Assignment: ${t.assignment.name}`, contentType: 'text', body: t.assignment.body, order: 1 },
          ...(project ? [{ title: `${project.code} · ${project.name}`, contentType: 'text', body: projectBody(project), order: 2 }] : []),
        ],
      };
    }),
  }));
}

export function generalistModules() {
  return GENERALIST_WEEKS.map((w, wi) => {
    // A week's overview (objective · identity shift · Claude features ·
    // outcome) is the module's description, not a chapter of lessons. As
    // lessons they were the same three or four rows repeated at the top of
    // every week, pushing the actual sessions down the syllabus; as a page
    // the reader shows them, headed, the moment the week is opened.
    const description = [
      ['Weekly objective', w.objective],
      ['Identity shift', w.identityShift],
      ['Claude features applied this week', w.claudeFeatures],
      ['Week outcome', w.outcome],
    ].filter(([, body]) => body).map(([h, body]) => `## ${h}\n\n${body}`).join('\n\n');
    const chapters = [
      // Same treatment one level down. Four of a session's five lessons were
      // framing — what it carries forward, how Claude is used, what you build,
      // what you build it with — and only "Key topics covered" was the class
      // itself. The framing becomes the session's page, read when the session
      // is opened; the lesson list is then what is actually taught.
      ...w.sessions.map((s) => {
        const framing = [
          ['Carries forward', s.carries],
          ['Claude usage in this session', s.claudeUsage],
          ['Build', s.build],
          ['Tool stack this session', s.tools],
        ].filter(([, body]) => body);
        const lesson = (title, body, order) => ({ title, contentType: 'text', body, order });
        return {
          title: `${s.code} · Week ${w.week}: ${s.title}`,
          description: framing.map(([h, body]) => `## ${h}\n\n${body}`).join('\n\n'),
          topics: [lesson('Key topics covered', bullets(s.topics), 0)],
        };
      }),
      // The weekly assignment folds the same way, but its page is the brief
      // and is named that — "Overview" would be a worse word for the one
      // thing a student opens an assignment to read.
      {
        title: `Weekly Assignment: ${w.assignment.name}`,
        pageLabel: 'Brief',
        description: w.assignment.brief,
        topics: [
          {
            title: 'Submission',
            contentType: 'text',
            body: `Submit as: ${w.assignment.submitAs}
Time estimate: ${w.assignment.time}
Feeds into: ${w.assignment.feedsInto}`,
            order: 0,
          },
        ],
      },
    ];
    if (w.milestone) {
      const m = w.milestone;
      // A milestone project splits the same way the weekly assignment does:
      // what the project IS is the brief you read on opening it, and what you
      // have to hand over — the bar it must clear, and how you present it —
      // is the one lesson under it.
      chapters.push({
        title: `Milestone Project ${m.n} · ${m.name}`,
        pageLabel: 'Brief',
        description: [
          ['Objective', `${m.tagline}\n\n${m.objective}`],
          ['What to build', m.whatToBuild],
          ['Tools', m.tools],
        ].map(([h, body]) => `## ${h}\n\n${body}`).join('\n\n'),
        topics: [
          {
            title: 'Submission',
            contentType: 'text',
            body: [
              ['Success criteria', m.success],
              ['Presentation', m.presentation],
            ].map(([h, body]) => `## ${h}\n\n${body}`).join('\n\n'),
            order: 0,
          },
        ],
      });
    }
    // Chapter order is positional, so dropping the overview leaves no gap.
    return { title: `WEEK ${w.week} · ${w.title}`, description, order: wi, chapters: chapters.map((ch, i) => ({ ...ch, order: i })) };
  });
}

// A heading per pair; a list becomes bullets, as every other lesson body does.
const fdeSections = (pairs) => pairs
  .filter(([, body]) => body && body.length)
  .map(([h, body]) => `## ${h}\n\n${Array.isArray(body) ? bullets(body) : body}`)
  .join('\n\n');

const fdeLesson = (title, body, order) => ({ title, contentType: 'text', body, order });

const FDE_DEFENCE = 'Why did you build it this way, and what happens when it breaks? 10 min solution walk-through · 10 min hidden-scenario results · 10 min live change request and panel Q&A.';

// A case opens its two-week block: what the client wants, before the first
// session of it. The capstone has four briefs in place of one client.
function fdeCaseChapter(c) {
  const opening = ['The case', `Case ${c.n} · Weeks ${c.weeks} · ${c.sector}. Project ${c.n}: ${c.project}. ${c.origin}`];
  if (c.briefs) {
    return {
      title: `Case ${c.n} · ${c.title}`,
      pageLabel: 'Brief',
      description: fdeSections([opening, ['How the capstone works', c.howItWorks]]),
      topics: [
        fdeLesson('The four briefs', fdeSections(c.briefs), 0),
        fdeLesson('Acceptance', fdeSections([
          ['Definition of Done', 'The deployed system, runbook and executive readout are delivered and match the agreed SOW.'],
          ['Hidden scenarios', 'The hidden scenario suite is passed.'],
          ['Graduation', 'The 12 graduation questions are answered live.'],
          ['Time', c.time],
        ]), 1),
      ],
    };
  }
  return {
    title: `Case ${c.n} · ${c.title}`,
    pageLabel: 'Brief',
    description: fdeSections([opening, ['The real-world context', c.context], ['The client ask', c.ask]]),
    topics: [
      fdeLesson('Engagement brief', fdeSections([
        ['Data kit', c.dataKit], ['Constraints', c.constraints], ['Objective', c.objective],
        ['Hidden scenarios', c.hidden], ['Success', c.success], ['Curveball', c.curveball],
        ['Builder / Engineer', c.tracks], ['Time', c.time],
      ]), 0),
      fdeLesson('Case Defence', fdeSections([['Second Sunday', FDE_DEFENCE], ['Focus', c.focus]]), 1),
    ],
  };
}

// The project is handed in where it finishes. "Submit as:" comes last in the
// lesson so the folder check (requiredTypesFor reads from that line on) sees
// the hand-in alone, and not the words of the brief above it: Case 2's context
// says "images", which must not make a screenshot compulsory.
function fdeProjectChapter(c, w, checkpoint) {
  return {
    title: `Milestone Project ${c.n} · ${c.project}`,
    pageLabel: 'Brief',
    description: fdeSections([
      ['Objective', c.objective],
      ['What you start from', c.origin],
      ['Constraints', c.constraints],
      ['Success', c.success],
      ['Foundation checkpoint (Week A)', checkpoint],
    ]),
    topics: [fdeLesson('Submission', `${fdeSections([
      ['Deliverables', w.finished.due],
      ['Gate', w.finished.gate],
      ['Case Defence', c.focus ? `${FDE_DEFENCE} Focus: ${c.focus}` : ''],
      ['Component owner', 'Name the component you own and defend alone.'],
      ['Pod roles', 'Client lead · Quality lead · Delivery lead (rotates each case)'],
      ['Mentor sign-off', 'Rubric level: Not yet / Meets / Strong / Hire-ready'],
      ['Portfolio', 'Repository, report and defence record added to your public portfolio.'],
    ])}\n\nSubmit as: ${c.submit}`, 0)],
  };
}

export function fdeModules() {
  return FDE_WEEKS.map((w, wi) => {
    const c = FDE_CASES.find((x) => x.n === w.caseN);
    const description = fdeSections([
      ['Stage', w.stage],
      ['Week objective', w.objective],
      ['Identity shift', w.identityShift],
      ['Case', `Case ${c.n} · Project: ${c.project} · Week ${w.block} of 2`],
      ['Week outcome', w.outcome],
    ]);
    const chapters = [
      ...(w.block === 'A' ? [fdeCaseChapter(c)] : []),
      // A session reads as the Generalist's does: the framing is its page, the
      // lessons are what is taught. Topic titles carry the competency code,
      // because a competency is what a fellow is signed off on.
      ...w.sessions.map((s) => ({
        title: `${s.code} · Week ${w.week}: ${s.title}`,
        description: fdeSections([
          ['Builds on', s.carries],
          ['Claude in use', s.claudeUsage],
          ['Build', s.build],
          ['Tool stack', s.tools],
        ]),
        topics: [
          fdeLesson('Key topics covered', bullets(s.topics.map(([code, name, teaches]) => `${code} · ${name}: ${teaches}`)), 0),
          fdeLesson('Hands-on tasks', bullets(s.topics.map(([code, , , task]) => `${code} · ${task}`)), 1),
          ...(w.week === 12 && s.code === 'S2' ? [fdeLesson('The 12 graduation questions', bullets(FDE_GRADUATION_QUESTIONS), 2)] : []),
        ],
      })),
      ...(w.lab ? [{
        title: `Lab: ${w.lab.title}`,
        pageLabel: 'Steps',
        description: fdeSections([[w.lab.tag, w.lab.steps]]),
        topics: [fdeLesson('How it is graded', fdeSections([['Your track', w.lab.track], ['Graded on', w.lab.gradedOn]]), 0)],
      }] : []),
      {
        title: `Weekly Assignment: ${w.assignment.name}`,
        pageLabel: 'Brief',
        description: w.assignment.brief,
        topics: [fdeLesson('Submission', `Submit as: ${w.assignment.submitAs}
Time estimate: ${w.assignment.time}
Assessed by: Mentor review in your 15-minute 1:1, checked against the week’s ten competencies.
Feeds into: ${w.assignment.feedsInto}`, 0)],
      },
      ...(w.block === 'B' ? [fdeProjectChapter(c, w, FDE_WEEKS.find((x) => x.caseN === c.n && x.block === 'A').checkpoint)] : []),
    ];
    return { title: `WEEK ${w.week} · ${w.title}`, description, order: wi, chapters: chapters.map((ch, i) => ({ ...ch, order: i })) };
  });
}

export const KICKSTARTER_DESCRIPTION =
  'Menler AI Kickstarter: 4 sessions, 19 topics, 4 portfolio projects. Two weekends, one portfolio.';
export const GENERALIST_DESCRIPTION =
  'The Claude-First AI Generalist Fellowship: 6 weeks, 12 live sessions, 4 milestone projects. Build-first, Claude at the centre of every week.';
export const FDE_DESCRIPTION =
  'The Menler AI FDE Fellowship: 12 weeks, 24 live sessions, 6 real-world cases, 12 assignments, 6 milestone projects. Defended, not just delivered.';
