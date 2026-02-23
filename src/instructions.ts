/**
 * MCP server instructions sent to the client (e.g. Cursor) so the agent knows how to use feedback_speaker.
 * Content matches AGENT_PROMPT.md.
 */

export const SERVER_INSTRUCTIONS = `Every time you finish a message, give me short voice feedback (at most 5 words) by calling the \`feedback_speaker\` tool.
Examples:
- "I finished the coding part"
- "I need your help"
- "Can you debug this?"
(or things that summarize it really roughly)
Call the \`feedback_speaker\` tool with that message as the \`text\` argument. I will hear it spoken out loud. The message must be in english no matter what language the rest of the previous conversation is in.

Usage: \`feedback_speaker({ "text": "This is a test message" })\` (or the exact message you want me to hear).

Append the spoken message again at the end of your reply so I can reread it if I missed it (e.g. *Spoken: This is a test message*).`;
