import type { WingmanConfig } from "../config.js";
import type { Platform } from "../types.js";
import type { Channel } from "./channel.js";
import { MockChannel } from "./mock.js";
import { GroupsLive, MarketplaceLive, TinderLive } from "./live.js";
import { createLogger } from "../logger.js";

const log = createLogger("channels");

function buildChannel(platform: Platform, cfg: WingmanConfig): Channel | null {
  const chCfg = cfg.channels[platform];
  if (chCfg.mode === "off") {
    log.info(`Channel ${platform} is off; skipping.`);
    return null;
  }
  if (chCfg.mode === "mock") return new MockChannel(platform, chCfg, cfg);

  switch (platform) {
    case "tinder":
      return new TinderLive(platform, chCfg, cfg);
    case "marketplace":
      return new MarketplaceLive(platform, chCfg, cfg);
    case "groups":
      return new GroupsLive(platform, chCfg, cfg);
  }
}

/** Build every enabled channel for this config. */
export function buildChannels(cfg: WingmanConfig): Channel[] {
  const platforms: Platform[] = ["tinder", "marketplace", "groups"];
  const channels: Channel[] = [];
  for (const p of platforms) {
    const ch = buildChannel(p, cfg);
    if (ch) channels.push(ch);
  }
  return channels;
}
