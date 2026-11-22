import type { Component } from "svelte";
/** A foreign VNode for this renderer: a Svelte component to render in place. */
export type SvelteForeign = {
    component: Component<any>;
    props?: Record<string, unknown>;
};
