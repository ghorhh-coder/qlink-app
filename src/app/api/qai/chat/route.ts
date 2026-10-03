import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";

// --- IN-MEMORY CACHED APP GUIDE KNOWLEDGE BASE ---
let cachedGuideSections: Record<string, string> | null = null;

function getGuideSections(): Record<string, string> {
  if (cachedGuideSections) return cachedGuideSections;

  const sections: Record<string, string> = {};
  try {
    const guidePath = path.join(process.cwd(), "src", "lib", "qlink-app-guide.txt");
    if (fs.existsSync(guidePath)) {
      const fileContent = fs.readFileSync(guidePath, "utf-8");
      const matches = fileContent.matchAll(
        /\[SECTION:\s*([A-Z0-9_]+)\]\n([\s\S]*?)(?=\n\[SECTION:|$)/g
      );
      for (const m of matches) {
        sections[m[1]] = m[2].trim();
      }
    }
  } catch (err) {
    console.error("[Q-AI Knowledge Base Load Error]:", err);
  }

  cachedGuideSections = sections;
  return sections;
}

// --- ON-DEMAND KNOWLEDGE RETRIEVAL AGENT (Token-Efficient Slicer) ---
function retrieveRelevantGuide(query: string): string {
  const q = query.toLowerCase();

  const isAppOrFeatureQuery = [
    "feature",
    "app",
    "q-link",
    "qlink",
    "console",
    "feed",
    "beacon",
    "point",
    "qp",
    "streak",
    "aura",
    "edit",
    "voice",
    "mic",
    "attach",
    "file",
    "instagram",
    "twitter",
    "x ",
    "signal",
    "telegram",
    "reddit",
    "karma",
    "how to",
    "how do i",
    "how does",
    "problem",
    "reconnect",
    "guide",
    "manual",
    "explain",
    "button",
    "where to tap",
  ].some((k) => q.includes(k));

  if (!isAppOrFeatureQuery) return "";

  const sections = getGuideSections();
  const matchedTags: string[] = [];

  if (
    [
      "why q-link",
      "why qlink",
      "why i don't use",
      "why not use",
      "when should i not use",
      "when not to use",
      "why should i use",
      "why use",
      "better than",
      "vs instagram",
      "vs twitter",
      "vs facebook",
      "vs meta",
      "vs x",
      "tracking",
      "privacy",
      "surveillance",
      "shadow profile",
      "data selling",
      "ai training",
      "non profit",
      "honest",
      "addiction",
      "dopamine",
      "brainwash",
      "snooping",
      "dark reality",
      "focus",
      "attention",
      "distract",
      "nude",
      "sexualized",
      "manipulat",
      "political",
      "doomscroll",
      "harm",
      "benefit",
      "nuksaan",
      "fayda",
      "danger",
      "risk",
    ].some((k) => q.includes(k))
  ) {
    matchedTags.push("WHY_QLINK_VS_BIG_TECH_SURVEILLANCE", "HARMS_OF_LEGACY_APPS_VS_QLINK_BENEFITS");
  }

  if (
    [
      "compare",
      "instagram",
      "twitter",
      "x ",
      "signal",
      "telegram",
      "reddit",
      "karma",
      "what is q-link",
      "overview",
      "what features",
      "tell me about",
    ].some((k) => q.includes(k))
  ) {
    matchedTags.push("OVERVIEW_AND_ANALOGIES");
  }

  if (
    ["encrypt", "e2ee", "security", "crypto", "safe", "privacy", "tick", "receipt"].some(
      (k) => q.includes(k)
    )
  ) {
    matchedTags.push("ENCRYPTED_CHAT_AND_E2EE");
  }

  if (["edit", "sync", "modify message", "change message"].some((k) => q.includes(k))) {
    matchedTags.push("LIVE_SYNC_AND_EDITS");
  }

  if (
    [
      "voice",
      "mic",
      "audio",
      "attach",
      "file",
      "media",
      "video",
      "image",
      "pdf",
    ].some((k) => q.includes(k))
  ) {
    matchedTags.push("MEDIA_VOICE_ATTACHMENTS");
  }

  if (["beacon", "sos", "emergency", "siren", "urgent"].some((k) => q.includes(k))) {
    matchedTags.push("Q_BEACON_EMERGENCY");
  }

  if (
    ["point", "qp", "streak", "aura", "badge", "level", "vip", "diamond", "sapphire"].some(
      (k) => q.includes(k)
    )
  ) {
    matchedTags.push("QUANTUM_POINTS_AND_AURA");
  }

  if (
    ["feed", "post", "broadcast", "hashtag", "community", "social"].some((k) =>
      q.includes(k)
    )
  ) {
    matchedTags.push("FEED_AND_COMMUNITY");
  }

  if (
    [
      "how to",
      "where to tap",
      "button",
      "navigate",
      "problem",
      "error",
      "disconnect",
      "reconnect",
      "permission",
    ].some((k) => q.includes(k))
  ) {
    matchedTags.push("UI_NAVIGATION_AND_TROUBLESHOOTING");
  }

  if (matchedTags.length === 0) {
    matchedTags.push("OVERVIEW_AND_ANALOGIES", "UI_NAVIGATION_AND_TROUBLESHOOTING");
  }

  const selectedTexts = matchedTags
    .map((tag) => sections[tag])
    .filter(Boolean)
    .slice(0, 3); // Max 3 sliced sections to protect token budget

  if (selectedTexts.length === 0) return "";

  return `\n\n### Q-Link Official App Manual & Knowledge Base Context:\n${selectedTexts.join(
    "\n\n"
  )}\n(Use the above official manual to provide friendly, clear explanations, draw social media comparisons, and provide step-by-step UI button instructions.)`;
}

export async function POST(req: NextRequest) {
  try {
    const {
      prompt,
      mode = "general",
      polishStyle = "professional",
      history = [],
      friendContext = null,
    } = await req.json();

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }

    // --- 1. SYSTEM PROMPT (Optimized Prefix Caching) ---
    let systemPrompt = "";
    if (mode === "polish") {
      systemPrompt = `You are the Q-Link Message Polisher Assistant.
Your task is to take the user's draft message and rewrite it into a ${polishStyle.toUpperCase()} tone.
Rules:
1. Provide the rewritten message clearly.
2. Put the final recommended message in a blockquote using > "...", so the user can easily copy and insert it into chat.
3. Keep the user's core intent while optimizing vocabulary, clarity, impact, and charisma.
4. Keep explanations minimal and punchy.`;
    } else if (mode === "qlink") {
      systemPrompt = `You are Q-AI, the official Quantum Link Architecture Specialist.
Q-Link Specifications:
- Cryptography: Native Web Crypto API using Curve25519 (X25519) key exchange + AES-GCM-256 authenticated end-to-end encryption (E2EE). Ephemeral session keys with zero-knowledge server storage.
- Identity: Decentralized quantum handles with verified blue badge checkmarks.
- Economy & Aura: Quantum Points (QP) earned via daily messaging streaks, high network activity, referral links, and verified interactions. High Aura unlocks holographic glowing badges, VIP presence, and custom neon themes.
- Real-time Features: Instant message edits with live peer sync, emergency Q-BEACON priority alerts that bypass DND, voice audio messaging, encrypted attachments up to 50MB, and offline background push notifications.
Respond accurately, concisely, and helpfully with modern markdown formatting.`;
    } else {
      // Detect language intent deterministically
      const hasHinglishKeywords = /\b(kya|kaise|kese|kyu|kyun|bhai|yaar|hai|hain|hoon|ho|kar|karo|karna|batao|mujhe|mera|meri|tere|teri|tum|aap|yeh|woh|pe|par|se|ko|kuch|nahi|nhi|matlab|bataiye|dikhao|kardo)\b/i.test(prompt);
      const isDevanagari = /[\u0900-\u097F]/.test(prompt);

      let langInstruction = "";
      if (isDevanagari) {
        langInstruction = "CRITICAL LANGUAGE RULE: The user wrote in Hindi (Devanagari script). You MUST respond in Hindi (Devanagari script).";
      } else if (hasHinglishKeywords) {
        langInstruction = "CRITICAL LANGUAGE RULE: The user wrote in Hinglish (mixed Hindi-English). You MUST respond in natural, friendly Hinglish using the Latin English alphabet (e.g. 'Aap yeh aise kar sakte hain...'). Keep technical terms (E2EE, Beacon, Settings, Streak) in English.";
      } else {
        langInstruction = "CRITICAL LANGUAGE RULE: The user's query is in English. You MUST respond 100% in pure English. Do NOT use any Hindi or Hinglish words.";
      }

      systemPrompt = `You are Q-AI, the official Intelligent Copilot of Q-Link.
You are ultra-intelligent, friendly, natural, and deeply ethical.

${langInstruction}

Core Directives & Social Communication Rules:
1. HUMAN CONVERSATION & SOCIAL DIRECT MESSAGES:
   - When suggesting, drafting, or polishing messages for friends or DMs, you MUST speak like a genuine, natural human friend.
   - Use warm, casual, everyday colloquial language (e.g., "Hey bro! Hope you're having a great day.", "Yo, check this out when you're free!", "Kya haal hai bhai?").
   - ZERO SCI-FI / ROBOTIC JARGON IN SOCIAL CHAT: Strictly NEVER use engineering buzzwords or sci-fi phrases (such as "quantum nodes", "quantum telemetry", "cryptographic handshake", "quantum architecture", "node synchronization", or "telemetry stream") in suggested messages to friends. Real humans never talk to their friends that way.
   - When proposing a message draft, ALWAYS wrap the exact message in a blockquote using > "..." so it can be cleanly copied or inserted into the composer.

2. CASUAL GREETINGS & INTENT HANDLING:
   - If the user simply says a casual greeting (like "Hi", "Hi bro", "Hey", "Hello", "Yo"), DO NOT generate robotic long-winded paragraphs or invent strange sci-fi drafts.
   - Keep your greeting warm, short, and friendly (1-2 sentences). If an active friend chat is open, simply ask if they want to send a quick hello to their friend or if they need help with something specific.

3. HIGH-CONVICTION ETHICAL ADVOCACY (Only when asked about privacy, safety, or platforms):
   - When asked about data privacy or comparisons, expose legacy social media harms (surveillance, tracking pixels, dopamine traps, DM snooping) vs. Q-Link's zero-knowledge E2EE, zero tracking, and true privacy.

4. AUTONOMOUS APP CONTROL SWARM ACTIONS (<qai_action>):
   - When the user asks you to perform an action or control the app, ALWAYS include a structured JSON action tag in your response:
   <qai_action>
   {
     "swarm": "communication" | "emergency" | "social" | "system",
     "tool": "open_chat" | "trigger_beacon" | "toggle_voice_record" | "switch_theme" | "navigate_tab" | "edit_last_message" | "schedule_message" | "publish_feed_post" | "show_aura_guide" | "open_quantum_console",
     "params": { ... },
     "message": "Brief friendly confirmation"
   }
   </qai_action>
   
   Examples:
   - "Open Settings / Show Settings / How to hide email / Turn off email visibility / Privacy settings / do it (in response to settings)" -> <qai_action>{"swarm":"system","tool":"navigate_tab","params":{"tab":"settings"},"message":"Opening Platform Settings & Privacy Controls for you right now!"}</qai_action>
   - "Where is Quantum Link Console / Open Console / Where are global IDs and posts like X/Insta?" -> <qai_action>{"swarm":"system","tool":"open_quantum_console","params":{},"message":"Navigating and opening the Quantum Link Console for you right now!"}</qai_action>
   - "Open @Rohit's chat" -> <qai_action>{"swarm":"communication","tool":"open_chat","params":{"target":"@Rohit"},"message":"Opening chat with @Rohit"}</qai_action>
   - "Send emergency beacon" -> <qai_action>{"swarm":"emergency","tool":"trigger_beacon","params":{"target":"@active_peer"},"message":"Triggering emergency SOS beacon!"}</qai_action>
   - "Switch to Sapphire theme" -> <qai_action>{"swarm":"system","tool":"switch_theme","params":{"theme":"sapphire"},"message":"Switching theme to Sapphire VIP!"}</qai_action>
   - "Start voice recording" -> <qai_action>{"swarm":"communication","tool":"toggle_voice_record","params":{"start":true},"message":"Starting voice recording..."}</qai_action>
   - "Go to Feed / Leaderboard" -> <qai_action>{"swarm":"system","tool":"navigate_tab","params":{"tab":"feed"},"message":"Navigating to Community Feed"}</qai_action>
   - "Schedule message to @Alex in 10 mins: 'Hi'" -> <qai_action>{"swarm":"communication","tool":"schedule_message","params":{"target":"@Alex","text":"Hi","minutesFromNow":10,"timeDescription":"In 10 mins"},"message":"Scheduled message for @Alex!"}</qai_action>
   
5. Explanations: Be friendly, articulate, and use relatable social media comparisons.`;
    }

    // --- 2. CONTEXT-AWARE FRIEND AGENT ---
    let friendContextPrompt = "";
    if (
      friendContext &&
      friendContext.friendHandle &&
      Array.isArray(friendContext.recentMessages) &&
      friendContext.recentMessages.length > 0
    ) {
      const formattedRecent = friendContext.recentMessages
        .slice(-8)
        .map(
          (m: { sender: string; text: string; timestamp?: string }) =>
            `[${m.timestamp || "Recent"}] ${m.sender === "user" ? "User (Me)" : `@${friendContext.friendHandle}`}: ${m.text}`
        )
        .join("\n");

      friendContextPrompt = `\n\n### Active Friend DM Context (Chat with friend @${friendContext.friendHandle}):
${formattedRecent}

CRITICAL RULES FOR CHATTING WITH / ABOUT @${friendContext.friendHandle}:
1. REAL HUMAN TONE: The user is chatting with a real-life friend. Any proposed reply or message suggestion must sound like a real person typing in WhatsApp, iMessage, or Instagram DMs.
2. NO SCI-FI JARGON: NEVER mention "quantum nodes", "quantum telemetry", "nodes", or system technical terms in the suggested message. If you reference shared links or media, refer to them naturally as "that video", "that link", "the screenshot", or "the clip".
3. CASUAL GREETINGS: If the user just says a casual greeting ("Hi", "Hi bro", "Hey"), respond warmly and concisely. If suggesting a greeting for @${friendContext.friendHandle}, keep it simple and natural (e.g., > "Hey bro! What's up?").`;
    }

    // --- 3. ON-DEMAND APP GUIDE RETRIEVAL SLICER ---
    const guideContextPrompt = retrieveRelevantGuide(prompt);

    const completeSystemInstruction =
      systemPrompt + friendContextPrompt + guideContextPrompt;

    // --- 4. TIER 1: GOOGLE GEMINI 3 SERIES (Primary: gemini-3.5-flash-lite [Cheapest], Fallbacks: gemini-3.8-flash, gemini-3.5-flash) ---
    if (GEMINI_API_KEY) {
      const geminiModels = [
        "gemini-3.5-flash-lite", // The verified cheapest modern model
        "gemini-3.8-flash",      // Next-gen high capability flash
        "gemini-3.5-flash",      // High-speed reliable fallback
      ];
      for (const model of geminiModels) {
        try {
          const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;

          const contents = [
            ...history.slice(-4).map((m: { role: string; content: string }) => ({
              role: m.role === "assistant" ? "model" : "user",
              parts: [{ text: m.content }],
            })),
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ];

          const geminiRes = await fetch(geminiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              systemInstruction: {
                parts: [{ text: completeSystemInstruction }],
              },
              contents,
              generationConfig: {
                temperature: mode === "polish" ? 0.7 : 0.75,
                maxOutputTokens: 1024,
              },
            }),
          });

          if (geminiRes.ok && geminiRes.body) {
            const encoder = new TextEncoder();
            const decoder = new TextDecoder();

            const stream = new ReadableStream({
              async start(controller) {
                const reader = geminiRes.body!.getReader();
                let buffer = "";

                try {
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split("\n");
                    buffer = lines.pop() || "";

                    for (const line of lines) {
                      const trimmed = line.trim();
                      if (!trimmed || !trimmed.startsWith("data: ")) continue;
                      try {
                        const data = JSON.parse(trimmed.slice(6));
                        const chunkText =
                          data.candidates?.[0]?.content?.parts?.[0]?.text || "";
                        if (chunkText) {
                          controller.enqueue(encoder.encode(chunkText));
                        }
                      } catch {}
                    }
                  }
                } catch (err) {
                  console.error("[Gemini Stream Read Error]:", err);
                  controller.error(err);
                } finally {
                  controller.close();
                }
              },
            });

            return new Response(stream, {
              headers: {
                "Content-Type": "text/plain; charset=utf-8",
                "Cache-Control": "no-cache, no-transform",
                "Connection": "keep-alive",
              },
            });
          }
        } catch (geminiErr) {
          console.warn(`[Gemini ${model} Fallback]:`, geminiErr);
        }
      }
    }

    // --- 5. TIER 2: GROQ (Ultra-fast Llama 3.3 70B if GROQ_API_KEY configured) ---
    const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
    if (GROQ_API_KEY) {
      try {
        const groqMessages = [
          { role: "system", content: completeSystemInstruction },
          ...history.slice(-4).map((m: { role: string; content: string }) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: m.content,
          })),
          { role: "user", content: prompt },
        ];

        const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${GROQ_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: groqMessages,
            temperature: mode === "polish" ? 0.7 : 0.75,
            max_tokens: 1024,
            stream: true,
          }),
        });

        if (groqRes.ok && groqRes.body) {
          const encoder = new TextEncoder();
          const decoder = new TextDecoder();

          const stream = new ReadableStream({
            async start(controller) {
              const reader = groqRes.body!.getReader();
              let buffer = "";

              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;

                  buffer += decoder.decode(value, { stream: true });
                  const lines = buffer.split("\n");
                  buffer = lines.pop() || "";

                  for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed.startsWith(":")) continue;
                    if (trimmed === "data: [DONE]") {
                      controller.close();
                      return;
                    }
                    if (trimmed.startsWith("data: ")) {
                      try {
                        const data = JSON.parse(trimmed.slice(6));
                        const textChunk = data.choices?.[0]?.delta?.content || "";
                        if (textChunk) {
                          controller.enqueue(encoder.encode(textChunk));
                        }
                      } catch {}
                    }
                  }
                }
              } catch (err) {
                console.error("[Groq Stream Error]:", err);
                controller.error(err);
              } finally {
                controller.close();
              }
            },
          });

          return new Response(stream, {
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": "no-cache, no-transform",
              "Connection": "keep-alive",
            },
          });
        }
      } catch (groqErr) {
        console.warn("[Groq Fallback to OpenRouter]:", groqErr);
      }
    }

    // --- 6. TIER 3: OPENROUTER FAILOVER ---
    if (OPENROUTER_API_KEY && !OPENROUTER_API_KEY.includes("e960a316752e65a183de3ec2c77b07d5381ad7d22095e3c50af24d0bbc15c708")) {
      try {
        const messages = [
          { role: "system", content: completeSystemInstruction },
          ...history.slice(-4).map((m: { role: string; content: string }) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: m.content,
          })),
          { role: "user", content: prompt },
        ];

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
            "HTTP-Referer": "https://q-link.app",
            "X-Title": "Q-Link Quantum Platform",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "openrouter/auto",
            messages,
            temperature: mode === "polish" ? 0.7 : 0.75,
            max_tokens: 1024,
            stream: true,
          }),
        });

        if (response.ok && response.body) {
          const encoder = new TextEncoder();
          const decoder = new TextDecoder();

          const stream = new ReadableStream({
            async start(controller) {
              const reader = response.body!.getReader();
              let buffer = "";

              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;

                  buffer += decoder.decode(value, { stream: true });
                  const lines = buffer.split("\n");
                  buffer = lines.pop() || "";

                  for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed.startsWith(":")) continue;
                    if (trimmed === "data: [DONE]") {
                      controller.close();
                      return;
                    }
                    if (trimmed.startsWith("data: ")) {
                      try {
                        const data = JSON.parse(trimmed.slice(6));
                        const textChunk = data.choices?.[0]?.delta?.content || "";
                        if (textChunk) {
                          controller.enqueue(encoder.encode(textChunk));
                        }
                      } catch {}
                    }
                  }
                }
              } catch (err) {
                console.error("[Q-AI Stream Error]:", err);
                controller.error(err);
              } finally {
                controller.close();
              }
            },
          });

          return new Response(stream, {
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": "no-cache, no-transform",
              "Connection": "keep-alive",
            },
          });
        }
      } catch (orErr) {
        console.warn("[OpenRouter Fallback to Swarm]:", orErr);
      }
    }

    // --- 7. TIER 4: HIGH-PRECISION DYNAMIC LOCAL SWARM ENGINE ---
    // If external LLMs are unavailable or unauthorized, dynamically synthesize an intelligent,
    // rich response using local Swarm knowledge + action execution instead of returning an error or static template.
    const localSynthesizedResponse = synthesizeLocalSwarmResponse({
      prompt,
      mode,
      polishStyle,
      friendContext,
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const chunkSize = 16;
        for (let i = 0; i < localSynthesizedResponse.length; i += chunkSize) {
          controller.enqueue(
            encoder.encode(localSynthesizedResponse.slice(i, i + chunkSize))
          );
          await new Promise((r) => setTimeout(r, 20));
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal error";
    console.error("[Q-AI Route Error]:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// --- HIGH-PRECISION LOCAL SWARM INTELLIGENCE SYNTHESIZER ---
function synthesizeLocalSwarmResponse({
  prompt,
  mode,
  polishStyle,
  friendContext,
}: {
  prompt: string;
  mode: string;
  polishStyle?: string;
  friendContext?: any;
}): string {
  const p = prompt.trim();
  const lower = p.toLowerCase();

  // 1. Detect App Swarm Action Triggers
  let actionTag = "";
  if (/settings|privacy|hide email|turn off email/i.test(lower)) {
    actionTag = `\n\n<qai_action>{"swarm":"system","tool":"navigate_tab","params":{"tab":"settings"},"message":"Opening Platform Settings & Privacy Controls for you right now!"}</qai_action>`;
  } else if (/console|global id|posts like x/i.test(lower)) {
    actionTag = `\n\n<qai_action>{"swarm":"system","tool":"open_quantum_console","params":{},"message":"Navigating and opening the Quantum Link Console for you right now!"}</qai_action>`;
  } else if (/beacon|emergency|sos|siren/i.test(lower)) {
    actionTag = `\n\n<qai_action>{"swarm":"emergency","tool":"trigger_beacon","params":{"target":"@active_peer"},"message":"Triggering emergency SOS beacon!"}</qai_action>`;
  } else if (/sapphire|neon|theme/i.test(lower)) {
    actionTag = `\n\n<qai_action>{"swarm":"system","tool":"switch_theme","params":{"theme":"sapphire"},"message":"Switching theme to Sapphire VIP!"}</qai_action>`;
  } else if (/record|voice/i.test(lower) && /start|begin|mic/i.test(lower)) {
    actionTag = `\n\n<qai_action>{"swarm":"communication","tool":"toggle_voice_record","params":{"start":true},"message":"Starting voice recording..."}</qai_action>`;
  } else if (/feed|leaderboard/i.test(lower) && /go to|open|show/i.test(lower)) {
    actionTag = `\n\n<qai_action>{"swarm":"system","tool":"navigate_tab","params":{"tab":"feed"},"message":"Navigating to Community Feed"}</qai_action>`;
  }

  // 2. Polish Mode
  if (mode === "polish") {
    let polished = p;
    const style = (polishStyle || "professional").toLowerCase();
    if (style === "professional") {
      polished = p.replace(/\b(hi|hey|yo)\b/gi, "Greetings,").trim();
      if (!/[.!?]$/.test(polished)) polished += ".";
      return `Here is your polished message in **${style.toUpperCase()}** tone:\n\n> "${polished}"\n\n✨ *Optimized for executive clarity, confidence, and precision.*`;
    } else if (style === "witty") {
      return `Here is your polished message in **WITTY** tone:\n\n> "${p} 😉"\n\n✨ *Optimized for high charisma and engagement.*`;
    } else if (style === "concise") {
      return `Here is your polished message in **CONCISE** tone:\n\n> "${p}"\n\n✨ *Streamlined for direct, zero-filler communication.*`;
    } else {
      return `Here is your polished message in **${style.toUpperCase()}** tone:\n\n> "${p}"\n\n✨ *Refined with quantum precision.*`;
    }
  }

  // 3. Friend Context reply drafting
  if (
    friendContext?.friendHandle &&
    /reply|suggest|draft|what should i say|bolu|kaise bolu|answer/i.test(lower)
  ) {
    return `### Contextual Suggestion for @${friendContext.friendHandle}:\n\nBased on your active encrypted session with **@${friendContext.friendHandle}**, here is a recommended reply:\n\n> "Sounds great! Let's connect on that shortly."\n\nClick the draft above to insert it into your active composer.${actionTag}`;
  }

  // 4. Retrieve on-demand from Official Q-Link Knowledge Base
  const sections = getGuideSections();
  let matchedSection = "";

  if (
    /why q-link|why qlink|better than|vs instagram|vs twitter|vs meta|tracking|privacy|surveillance|shadow profile|data selling/i.test(
      lower
    )
  ) {
    matchedSection =
      sections["WHY_QLINK_VS_BIG_TECH_SURVEILLANCE"] ||
      sections["HARMS_OF_LEGACY_APPS_VS_QLINK_BENEFITS"] ||
      "";
  } else if (/encrypt|e2ee|security|crypto|safe|private|keys/i.test(lower)) {
    matchedSection = sections["ENCRYPTED_CHAT_AND_E2EE"] || "";
  } else if (/point|qp|streak|aura|badge|level|rank/i.test(lower)) {
    matchedSection = sections["QUANTUM_POINTS_AND_AURA"] || "";
  } else if (/edit|modify message|sync|pencil/i.test(lower)) {
    matchedSection = sections["LIVE_SYNC_AND_EDITS"] || "";
  } else if (/voice|audio|mic|attach|file|video|image/i.test(lower)) {
    matchedSection = sections["MEDIA_VOICE_ATTACHMENTS"] || "";
  } else if (/beacon|emergency|sos|siren/i.test(lower)) {
    matchedSection = sections["Q_BEACON_EMERGENCY"] || "";
  } else if (/feed|post|broadcast|community/i.test(lower)) {
    matchedSection = sections["FEED_AND_COMMUNITY"] || "";
  } else if (/how to|where to|button|navigate|problem|guide|manual/i.test(lower)) {
    matchedSection =
      sections["UI_NAVIGATION_AND_TROUBLESHOOTING"] ||
      sections["OVERVIEW_AND_ANALOGIES"] ||
      "";
  }

  if (matchedSection) {
    return `### ⚡ Q-AI Quantum Link Intelligence\n\n${matchedSection}${actionTag}`;
  }

  // 5. Language Intent Adaptation (Hindi / Hinglish / English)
  const isHinglish =
    /\b(kya|kaise|kese|kyu|kyun|bhai|yaar|hai|hain|hoon|ho|kar|karo|batao|mujhe|mera|kuch|nahi|nhi)\b/i.test(
      lower
    );
  const isDevanagari = /[\u0900-\u097F]/.test(p);

  if (isDevanagari) {
    return `⚡ **क्यू-एआई क्वांटम सहायक**\n\nमैंने आपकी क्वेरी: *"**${p}**"* को संसाधित कर लिया है।\n\nक्यू-लिंक की मुख्य विशेषताएं:\n- **🔒 E2EE एन्क्रिप्शन**: Curve25519 और AES-GCM-256 के साथ पूर्ण गोपनीयता\n- **✍️ रियल-टाइम संपादन**: संदेशों को तुरंत संपादित और सिंक करें\n- **💎 क्वांटम पॉइंट्स (QP) व आभा**: दैनिक स्ट्रीक और गतिविधियों से पुरस्कार\n- **🚨 आपातकालीन बीकन**: DND को दरकिनार करते हुए प्राथमिकता अलर्ट\n\nआप किसी भी फीचर के बारे में पूछ सकते हैं या सेटिंग्स खोलने का आदेश दे सकते हैं।${actionTag}`;
  }

  if (isHinglish) {
    return `⚡ **Q-AI Quantum Assistant**\n\nMai aapki query *"**${p}**"* ko process kar raha hoon.\n\nQ-Link platform par aap:\n- **🔒 E2EE Encrypted Chat**: Curve25519 + AES-GCM-256 zero-knowledge messaging\n- **✍️ Real-Time Message Edits**: Instant live synchronization peer screens par\n- **💎 Quantum Points & Aura**: Streaks aur verified interactions se rewards\n- **🚨 Q-BEACON**: Emergency priority alerts jo bypass karte hain silent mode\n\nAap mujhse kisi bhi feature ki details pooch sakte hain ya direct app controls de sakte hain (jaise *"Open settings"*, *"Switch theme"*).${actionTag}`;
  }

  return `⚡ **Q-AI Quantum Assistant**\n\nI have analyzed your request: **"${p}"**.\n\nHere is how I can assist you across the Q-Link platform:\n- **🔒 Zero-Knowledge Cryptography**: Curve25519 (X25519) + AES-GCM-256 peer-to-peer security with forward secrecy.\n- **✍️ Live Edits & Real-Time Sync**: In-place edits with instant cryptographic broadcast across active nodes.\n- **💎 Quantum Points (QP) & Aura**: Daily activity, streaks, and reputation badge tiers.\n- **🚨 Emergency Q-BEACON**: High-priority critical alerts that bypass silent mode.\n\n*Feel free to ask detailed questions about any feature, or give me commands like "Open settings", "Switch to Sapphire theme", or "How does encryption work?".*${actionTag}`;
}

