// Model review before a version becomes Public. OWNED BY THE STUDIO NODE (S), which replaces this stub
// with a real Claude call. Contract (do not change the signature):
//   reviewVersion(game, version) -> Promise<{ verdict: 'allowed'|'needs_changes'|'blocked'|'unavailable', reasons: string[], by: string }>
// 'unavailable' sends the version to the human review queue.
export async function reviewVersion(game, version) {
  return { verdict: 'unavailable', reasons: ['Model review is not configured; waiting for a human.'], by: 'none' };
}
