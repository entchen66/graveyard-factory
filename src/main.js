// @ts-check
import { Editor } from './editor.js';

// Exposed for debugging from the console.
/** @type {Window & { editor?: Editor }} */ (window).editor = new Editor(document);
