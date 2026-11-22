// A test stand-in for the AI of Oomba, the teaching companion (services/companion.js hooks.create) answering on a
// Figures worksheet the way the worksheet workflow did before one chat everywhere: json is { reply, title?, grade?,
// units?, edits }. The stand-in calls the page's tool (editWorksheet) with the change, then says the reply.
const CO = await import('../../server/services/companion.js');
export function figuresStandIn(json, { model = 'mock' } = {}) {
  const calls = [];
  CO.hooks.create = async params => {
    calls.push(params);
    const last = params.messages.at(-1), afterTool = Array.isArray(last.content) && last.content.some(c => c.type === 'tool_result');
    const j = typeof json === 'function' ? json(params) : json;
    const base = { model: params.model || model, usage: { input_tokens: 1, output_tokens: 1 } };
    if (afterTool) return { ...base, stop_reason: 'end_turn', content: [{ type: 'text', text: j.reply }] };
    const { reply, ...input } = j;
    return { ...base, stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `tu${calls.length}`, name: 'editWorksheet', input: { edits: [], ...input } }] };
  };
  return calls;
}
export const clearStandIn = () => { CO.hooks.create = null; };
