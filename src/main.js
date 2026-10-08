// @ts-check
import { Editor } from './editor.js';
import { initChangelog } from './changelog-ui.js';
import { initWelcome } from './welcome.js';

// Exposed for debugging from the console.
/** @type {Window & { editor?: Editor }} */ (window).editor = new Editor(document);
initChangelog(document, initWelcome(document));
