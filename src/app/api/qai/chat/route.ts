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

      systemPrompt = `You are Q-AI, the official Quantum Link Intelligent Copilot.
You are embedded directly inside the Q-Link next-generation quantum platform.
You are ultra-intelligent, articulate, high-conviction, friendly, and deeply ethical.

${langInstruction}

Core Directives & Autonomous Swarm Action Engine:
1. Message Drafting & Polish:
   - When drafting or proposing a message, ALWAYS wrap the exact proposed message in a blockquote > "..." so it can be autonomously inserted into the chat composer.
2. High-Conviction Ethical Advocacy (Harms vs Benefits):
   - Boldly expose the severe hidden harms of legacy social media (surveillance, tracking pixels, dopamine traps, DM snooping, rage-bait) vs. Q-Link's zero-knowledge E2EE, zero tracking, and true data sovereignty.
3. Autonomous App Control Swarm Actions (<qai_action>):
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
   
4. Explanations: Be friendly, articulate, and use relatable social media comparisons.`;
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

      friendContextPrompt = `\n\n### Active Conversation Context (with friend @${friendContext.friendHandle}):\n${formattedRecent}\n(Use this context to draft accurate, personalized suggestions.)`;
    }

    // --- 3. ON-DEMAND APP GUIDE RETRIEVAL SLICER ---
    const guideContextPrompt = retrieveRelevantGuide(prompt);

    const completeSystemInstruction =
      systemPrompt + friendContextPrompt + guideContextPrompt;

    // --- 4. TIER 1: CHEAPEST NATIVE GEMINI 3.5-FLASH-LITE ---
    if (GEMINI_API_KEY) {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;

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
        console.warn("[Gemini Primary Fallback to OpenRouter]:", geminiErr);
      }
    }

    // --- 5. TIER 2: HIGH-AVAILABILITY OPENROUTER FAILOVER ---
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

    if (!response.ok) {
      const errText = await response.text();
      console.error("[Q-AI OpenRouter Failover Error]:", response.status, errText);
      return NextResponse.json(
        { error: `API Error: ${response.status}` },
        { status: response.status }
      );
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        if (!response.body) {
          controller.close();
          return;
        }

        const reader = response.body.getReader();
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
              if (!trimmed || !trimmed.startsWith(":")) continue;
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
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal error";
    console.error("[Q-AI Route Error]:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

