// TypeScript has no built-in type for a side-effect CSS import (used by
// app/_layout.tsx's web-only global.css, Metro's CSS support). Native builds
// never import it — see the comment at that import.
declare module '*.css';
