// Ad provider interface. OWNED BY THE MONEY NODE (M), which replaces this stub.
// Contract (do not change): pickAd({ placement: 'grid'|'game', category, user }) -> { id, title, text, icon, href } | null
export function pickAd() {
  return { id: 'house-build', title: 'Make your own game', text: 'Tell our Builder your idea. It makes the game!', icon: '🛠️', href: '/build' };
}
