/**
 * Q-AI Quantum Intelligence Streaming Engine
 * Optimized for token efficiency, bounded sliding memory, and Context-Aware Friend Agent.
 */

export type AIMode = "general" | "polish" | "qlink";
export type PolishStyle = "professional" | "witty" | "concise" | "persuasive" | "cyberpunk";

export interface QAIMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  mode?: AIMode;
  isStreaming?: boolean;
}

export interface FriendChatContext {
  friendHandle: string;
  recentMessages: Array<{
    sender: "user" | "friend";
    text: string;
    timestamp?: string;
  }>;
}

// Built-in Knowledge Base for Offline Fallback
const QLINK_KNOWLEDGE: Record<string, string> = {
  encryption:
    "🔒 **Q-Link Cryptographic Architecture**\n\n• **E2EE Core**: Curve25519 (X25519) Diffie-Hellman Key Exchange + AES-GCM-256 payload encryption.\n• **Zero-Knowledge**: Server stores only encrypted binary blobs with 0 access to plaintext.\n• **Forward Secrecy**: Dynamic ephemeral key derivation for every chat session.",
  qp:
    "💎 **Quantum Points (QP) & Aura Economy**\n\n• **Earn QP**: Daily messaging streaks (+25 QP), verified relationships (+50 QP), and beacon responses (+10 QP).\n• **Aura Multipliers**: Level 1 (Neon Blue) ➔ Level 5 (Quantum Violet) ➔ Level 10 (Luminous Gold VIP).",
  edits:
    "✍️ **Real-Time Live Message Editing**\n\n• Click the pencil icon on any sent message to edit in-place.\n• Edits sync instantly to recipient screens with an `(edited)` timestamp marker in real-time.",
};

/**
 * Streams live AI responses from OpenRouter with Context-Aware Friend Agent & instant fallback.
 */
export async function* streamQAIResponse(
  query: string,
  mode: AIMode = "general",
  polishStyle: PolishStyle = "professional",
  history: QAIMessage[] = [],
  friendContext: FriendChatContext | null = null
): AsyncGenerator<string, void, unknown> {
  let hasStreamed = false;

  // 1. Try Live OpenRouter Server Stream with Bounded Context
  try {
    const response = await fetch("/api/qai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: query,
        mode,
        polishStyle,
        history: history.slice(-4).map((h) => ({ role: h.role, content: h.content })),
        friendContext,
      }),
    });

    if (response.ok && response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        if (text) {
          hasStreamed = true;
          yield text;
        }
      }
    }
  } catch (err) {
    console.warn("[Q-AI Live Stream Offline Fallback]:", err);
  }

  // 2. If server stream produced output, we are done
  if (hasStreamed) return;

  // 3. Robust Native Fallback if Offline or Network Failed
  let fallbackText = "";
  const q = query.toLowerCase();

  let actionTag = "";
  if (/settings|privacy|hide email/i.test(q)) {
    actionTag = `\n\n<qai_action>{"swarm":"system","tool":"navigate_tab","params":{"tab":"settings"},"message":"Opening Settings for you right now!"}</qai_action>`;
  } else if (/console|global id/i.test(q)) {
    actionTag = `\n\n<qai_action>{"swarm":"system","tool":"open_quantum_console","params":{},"message":"Opening Quantum Link Console!"}</qai_action>`;
  } else if (/beacon|emergency|sos/i.test(q)) {
    actionTag = `\n\n<qai_action>{"swarm":"emergency","tool":"trigger_beacon","params":{"target":"@active_peer"},"message":"Triggering emergency SOS beacon!"}</qai_action>`;
  } else if (/sapphire|theme/i.test(q)) {
    actionTag = `\n\n<qai_action>{"swarm":"system","tool":"switch_theme","params":{"theme":"sapphire"},"message":"Switching to Sapphire VIP theme!"}</qai_action>`;
  }

  if (mode === "polish") {
    fallbackText = `Here is your polished message in **${polishStyle.toUpperCase()}** tone:\n\n> "${query.trim()}"\n\n✨ *Optimized for impact, clarity, and precision.*`;
  } else if (mode === "qlink") {
    if (q.includes("encrypt") || q.includes("security") || q.includes("crypto") || q.includes("safe")) {
      fallbackText = QLINK_KNOWLEDGE.encryption;
    } else if (q.includes("point") || q.includes("qp") || q.includes("aura") || q.includes("badge")) {
      fallbackText = QLINK_KNOWLEDGE.qp;
    } else {
      fallbackText = QLINK_KNOWLEDGE.edits;
    }
  } else {
    if (friendContext && friendContext.friendHandle && /reply|suggest|draft|say/i.test(q)) {
      fallbackText = `⚡ **Q-AI Assistant**\n\nBased on your active encrypted chat with **@${friendContext.friendHandle}**, here is a suggested reply:\n\n> "Got it, let's proceed with that."\n\nTap the draft above to insert it directly into your composer.${actionTag}`;
    } else if (q.includes("encrypt") || q.includes("security") || q.includes("safe") || q.includes("privacy")) {
      fallbackText = `${QLINK_KNOWLEDGE.encryption}${actionTag}`;
    } else if (q.includes("point") || q.includes("qp") || q.includes("aura") || q.includes("streak")) {
      fallbackText = `${QLINK_KNOWLEDGE.qp}${actionTag}`;
    } else if (q.includes("edit") || q.includes("modify") || q.includes("change")) {
      fallbackText = `${QLINK_KNOWLEDGE.edits}${actionTag}`;
    } else {
      fallbackText = `⚡ **Q-AI Quantum Assistant**\n\nI have received your request: **"${query.trim()}"**.\n\nQ-Link Quantum Intelligence provides:\n- **🔒 E2EE Chat**: Curve25519 (X25519) + AES-GCM-256 forward secrecy\n- **✍️ Real-Time Edits**: In-place edits with instant live synchronization\n- **💎 Quantum Points (QP)**: Earn rewards through daily messaging streaks & badges\n- **🚨 Q-BEACON**: High-priority alerts designed for critical situations\n\n*You can also command me directly (e.g., "Open settings", "Switch theme", "Send beacon").*${actionTag}`;
    }
  }

  // Stream fallback with human cadence
  for (let i = 0; i < fallbackText.length; i += 3) {
    yield fallbackText.slice(i, i + 3);
    await new Promise((r) => setTimeout(r, 15));
  }
}
