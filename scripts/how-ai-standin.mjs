// A stand-in for Oomba's AI in the screenshot runs (scripts/how-shots.js --only tools): loaded with
// NODE_OPTIONS=--import into the throwaway server, it answers the teaching companion (services/companion.js hooks.create)
// the way the tests' stand-in does (tests/unit/_companion-standin.js), so the Figures worksheet in the pictures is a real
// worksheet, drawn and checked by the real Figures code. No AI is called and no key is needed. Never loaded by the site.
const CO = await import('../server/services/companion.js');

/** The worksheet Oomba "drafts": five figure questions, as editWorksheet edits. */
const WORKSHEET = {
  reply: 'Here are 5 questions on area and volume. Each figure is drawn to scale, and the answers are worked out in the key.',
  title: 'Area and volume practice',
  edits: [
    { kind: 'rectangle', question: 'Find the area of the garden bed.', data: JSON.stringify({ AB: 6, BC: 2, unit: 'm' }), answerKey: 'area' },
    { kind: 'prism', question: 'A gift box has these measurements. How much space is inside it?', data: JSON.stringify({ length: 5, width: 2, height: 3, unit: 'in' }), answerKey: 'volume' },
    { kind: 'cylinder', question: 'Find the volume of the can. Round to the nearest tenth.', data: JSON.stringify({ radius: 4, height: 11, unit: 'cm' }), answerKey: 'volume' },
    { kind: 'rectangle', question: 'A rug is 3 m by 4 m. What is its perimeter?', data: JSON.stringify({ AB: 4, BC: 3, unit: 'm' }), answerKey: 'perimeter' },
    { kind: 'prism', question: 'How many 1 cm cubes fill this box?', data: JSON.stringify({ length: 4, width: 3, height: 2, unit: 'cm' }), answerKey: 'volume' },
  ].map(item => ({ op: 'add', item })),
};

let n = 0;
CO.hooks.create = async params => {
  n += 1;
  const last = params.messages.at(-1);
  const afterTool = Array.isArray(last.content) && last.content.some(c => c.type === 'tool_result');
  const base = { model: 'stand-in', usage: { input_tokens: 1, output_tokens: 1 } };
  const tools = (params.tools || []).map(t => t.name);
  if (afterTool || !tools.includes('editWorksheet')) {
    const text = tools.includes('editWorksheet') ? WORKSHEET.reply : 'Happy to help. Tell me what you are teaching and I can find a game, draft a worksheet or set up your dashboard.';
    return { ...base, stop_reason: 'end_turn', content: [{ type: 'text', text }] };
  }
  const { reply, ...input } = WORKSHEET;
  return { ...base, stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `tu${n}`, name: 'editWorksheet', input: { edits: [], ...input } }] };
};
