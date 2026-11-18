import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { DIR, LANG } from './lib/i18n';

// The page speaks the player's language: lang for the screen reader and fonts, dir so Arabic and Hebrew read right to
// left (the worked problems themselves stay left to right, as on paper: see Work.svelte).
document.documentElement.lang = LANG;
document.documentElement.dir = DIR;

mount(App, { target: document.getElementById('app')! });
