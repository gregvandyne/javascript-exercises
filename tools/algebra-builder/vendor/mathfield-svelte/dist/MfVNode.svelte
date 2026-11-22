<script lang="ts">
  // Renders a Mf VNode tree as Svelte elements. A foreign node is a Svelte
  // component to render in place: { component, props }.
  import type { VNode } from "@oomba-mathfield/core";
  import Self from "./MfVNode.svelte";
  import type { SvelteForeign } from "./types";

  let { vnode }: { vnode: VNode<SvelteForeign> } = $props();

  // Keys only have to be unique among siblings; nodes without one use their position.
  const keyOf = (child: VNode<SvelteForeign>, i: number) =>
    (child && "key" in child && child.key) || `#${i}`;
</script>

{#if vnode === null || vnode === undefined}
  <!-- nothing -->
{:else if "text" in vnode}{vnode.text}{:else if "fragment" in vnode}{#each vnode.fragment as child, i (keyOf(child, i))}<Self vnode={child} />{/each}{:else if "foreign" in vnode}<vnode.foreign.component {...vnode.foreign.props ?? {}} />{:else}<svelte:element this={vnode.type} xmlns={vnode.namespaceURI} {...vnode.attributes}>{#each vnode.children as child, i (keyOf(child, i))}<Self vnode={child} />{/each}</svelte:element>{/if}
