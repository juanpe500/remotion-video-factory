/**
 * Note: When using the Node.JS APIs, the config file
 * doesn't apply. Instead, pass options directly to the APIs.
 *
 * All configuration options: https://remotion.dev/docs/config
 */

import { Config } from "@remotion/cli/config";
// import { enableTailwind } from '@remotion/tailwind-v4';

Config.setRspack(true);
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
// Tailwind override DISABLED: no composition uses Tailwind classes, and this
// pass blew the Rspack bundle up to ~8GB and stalled renders. Re-enable (with
// the import above and the @import in src/index.css) only if a comp needs it.
// Config.overrideBundlerConfig(enableTailwind);
// GL renderer for the cloud (no-GPU) container: this Chromium build only ships
// egl-angle, so "angle" needs a GPU it doesn't have and plain "swiftshader"
// isn't compiled in — "swangle" (SwiftShader-backed ANGLE, software) is the one
// that renders headless without a GPU. Keep compositions free of WebGL2 effects
// (e.g. @remotion/effects liquidContours) — software WebGL2 is slow/unstable.
Config.setChromiumOpenGlRenderer("swangle");
