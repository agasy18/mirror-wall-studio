import { renderToString } from "react-dom/server";
import { Landing } from "./screens/Landing";

/**
 * Build-time only. The landing markup is baked into dist/index.html so the page
 * carries real text for crawlers that do not execute JavaScript — which is most
 * of them apart from Googlebot.
 *
 * Rendered with hasSavedWork=false because the server cannot know: the client's
 * first render matches that, and AppFlow upgrades it after mount.
 */
export function renderLanding(): string {
  return renderToString(<Landing onLaunch={() => {}} hasSavedWork={false} />);
}
