// Vercel entry: the whole Express app runs as one function (see vercel.json rewrites).
// Built from src/ by `npm run vercel-build` before Vercel bundles this file.
import { createApp } from "../dist/app.js";

export default createApp();
