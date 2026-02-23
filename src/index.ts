#!/usr/bin/env node
/**
 * MCP server: feedback_speaker tool.
 * When the Cursor agent has a task for the user, it can call this tool to speak the text via system TTS (macOS say / Windows SAPI) or Edge TTS (natural online voice).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { spawn, exec } from "child_process";
import { promisify } from "util";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import { SERVER_INSTRUCTIONS } from "./instructions.js";

const execP = promisify(exec);

const ENGINE = process.env.MCP_SPEAK_ENGINE || "edge-tts"; // "say" | "edge-tts" | "openai-tts"
const OPENAI_VOICE = process.env.MCP_SPEAK_OPENAI_VOICE || "nova"; // 1=alloy, 2=echo, 3=fable, 4=onyx, 5=nova, 6=shimmer
const OPENAI_MODEL = process.env.MCP_SPEAK_OPENAI_MODEL || "tts-1-hd";
const DEFAULT_VOICE =
  process.platform === "darwin"
    ? "Daniel"
    : "";
const EDGE_VOICE = process.env.MCP_SPEAK_EDGE_VOICE || "en-US-GuyNeural";
/** Slightly slower = clearer articulation. Use MCP_SPEAK_EDGE_RATE (e.g. 90 = 90%, 100 = normal). */
const EDGE_RATE = parseInt(process.env.MCP_SPEAK_EDGE_RATE ?? "92", 10) || 100;
const DEFAULT_RATE = Math.min(300, Math.max(80, parseInt(process.env.MCP_SPEAK_RATE ?? "130", 10) || 130));

/** Only boost system volume when explicitly enabled (default: off so we don't change user's volume). */
const BOOST_VOLUME =
  process.env.MCP_SPEAK_BOOST_VOLUME === "1" ||
  process.env.MCP_SPEAK_BOOST_VOLUME === "true" ||
  process.env.MCP_SPEAK_BOOST_VOLUME === "yes";
const TTS_VOLUME = Math.min(100, Math.max(0, parseInt(process.env.MCP_SPEAK_TTS_VOLUME ?? "100", 10) || 100));

async function getMacVolume(): Promise<number> {
  const { stdout } = await execP('osascript -e "output volume of (get volume settings)"');
  const n = parseInt(String(stdout).trim(), 10);
  return Number.isNaN(n) ? 50 : Math.max(0, Math.min(100, n));
}

async function setMacVolume(vol: number): Promise<void> {
  const v = Math.max(0, Math.min(100, Math.round(vol)));
  await execP(`osascript -e "set volume output volume ${v}"`);
}

async function speakEdgeTTS(text: string, voice: string): Promise<void> {
  const { EdgeTTS } = await import("@andresaya/edge-tts");
  const tts = new EdgeTTS();
  const tmpBase = path.join(os.tmpdir(), `mcp-speak-${Date.now()}`);
  await tts.synthesize(text, voice, {
    outputFormat: "audio-24khz-96kbitrate-mono-mp3",
    rate: EDGE_RATE as unknown as number,
    volume: 100,
  });
  const outPath = await tts.toFile(tmpBase);
  const outFile = typeof outPath === "string" ? outPath : `${tmpBase}.mp3`;
  let restoreVol = 50;
  if (BOOST_VOLUME && process.platform === "darwin") {
    restoreVol = await getMacVolume();
    await setMacVolume(TTS_VOLUME);
  }
  await new Promise<void>((resolve, reject) => {
    const child = spawn("afplay", [outFile], { stdio: "ignore" });
    child.on("error", reject);
    child.on("close", (code) => {
      if (BOOST_VOLUME && process.platform === "darwin") setMacVolume(restoreVol).catch(() => {});
      code === 0 ? resolve() : reject(new Error(`afplay exited ${code}`));
    });
  });
  try {
    fs.unlinkSync(outFile);
  } catch {
    /* ignore */
  }
}

function speakSay(text: string, voice: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (process.platform === "darwin") {
      let restoreVol = 50;
      const runSay = () => {
        const args = ["-v", voice || DEFAULT_VOICE];
        if (DEFAULT_RATE > 0) args.push("-r", String(DEFAULT_RATE));
        args.push(text);
        const child = spawn("say", args, { stdio: "ignore" });
        child.on("error", reject);
        child.on("close", (code) => {
          if (BOOST_VOLUME) setMacVolume(restoreVol).catch(() => {});
          code === 0 ? resolve() : reject(new Error(`say exited ${code}`));
        });
      };
      if (BOOST_VOLUME) {
        getMacVolume()
          .then((v) => {
            restoreVol = v;
            return setMacVolume(TTS_VOLUME);
          })
          .then(() => runSay())
          .catch(reject);
      } else {
        runSay();
      }
    } else if (process.platform === "win32") {
      const escaped = text.replace(/'/g, "''").replace(/"/g, '\\"');
      execP(
        `powershell -Command "Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Speak('${escaped}');"`
      )
        .then(() => resolve())
        .catch(reject);
    } else {
      resolve();
    }
  });
}

/** Use param for Edge only if it looks like an Edge voice (e.g. contains "Neural"); otherwise use EDGE_VOICE. */
function edgeVoiceToUse(voice: string): string {
  if (voice && voice.includes("Neural")) return voice;
  return EDGE_VOICE;
}

async function speakOpenAI(text: string): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI({ apiKey });
  const response = await openai.audio.speech.create({
    model: OPENAI_MODEL as "tts-1" | "tts-1-hd",
    voice: OPENAI_VOICE as "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer",
    input: text,
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  const outFile = path.join(os.tmpdir(), `mcp-speak-openai-${Date.now()}.mp3`);
  await fs.promises.writeFile(outFile, buffer);
  let restoreVol = 50;
  if (BOOST_VOLUME && process.platform === "darwin") {
    restoreVol = await getMacVolume();
    await setMacVolume(TTS_VOLUME);
  }
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn("afplay", [outFile], { stdio: "ignore" });
      child.on("error", reject);
      child.on("close", (code) => {
        if (BOOST_VOLUME && process.platform === "darwin") setMacVolume(restoreVol).catch(() => {});
        code === 0 ? resolve() : reject(new Error(`afplay exited ${code}`));
      });
    });
  } finally {
    try {
      fs.unlinkSync(outFile);
    } catch {
      /* ignore */
    }
  }
}

async function speak(text: string, voice: string): Promise<void> {
  if (ENGINE === "openai-tts" && process.env.OPENAI_API_KEY) {
    if (process.platform === "darwin") {
      await speakOpenAI(text);
      return;
    }
    await speakSay(text, voice);
    return;
  }
  if (ENGINE === "edge-tts" && process.platform === "darwin") {
    try {
      await speakEdgeTTS(text, edgeVoiceToUse(voice));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Cannot find module") || msg.includes("Cannot find package") || msg.includes("MODULE_NOT_FOUND")) {
        await speakSay(text, voice);
      } else {
        throw err;
      }
    }
  } else {
    await speakSay(text, voice);
  }
}

async function main() {
  const server = new McpServer(
    {
      name: "mcp-speak",
      version: "0.1.0",
    },
    {
      instructions: SERVER_INSTRUCTIONS,
      capabilities: {
        tools: { listChanged: true },
      },
    }
  );

  server.registerTool(
    "feedback_speaker",
    {
      title: "Task Speaker",
      description:
        "Speak the given text to the user via system text-to-speech (e.g. when you have a task for them). Use this so the user hears the task instead of only reading it. Works in German and English with the configured voice.",
      inputSchema: {
        text: z.string().describe("The exact phrase to speak (e.g. the task instruction)."),
      },
    },
    async ({ text }) => {
      const voiceToUse = process.env.MCP_SPEAK_VOICE || DEFAULT_VOICE;
      // Run TTS in background so we don't block on OpenAI/Edge response
      speak(text, voiceToUse).catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[feedback_speaker] TTS failed: ${message}`);
      });
      return {
        content: [{ type: "text" as const, text: `Spoke to user: "${text.slice(0, 80)}${text.length > 80 ? "…" : ""}"` }],
      };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
