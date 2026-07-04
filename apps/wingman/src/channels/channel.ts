import type { ChannelConfig } from "../config.js";
import type { GroupLead, InboundEvent, Platform } from "../types.js";

/**
 * A Channel is the bridge between the orchestrator and one platform. Adapters
 * come in two modes: `mock` (synthetic activity, for local runs and tests) and
 * `live` (Playwright browser automation). The orchestrator only ever talks to
 * this interface, so swapping mock↔live changes nothing upstream.
 */
export interface Channel {
  readonly platform: Platform;
  readonly config: ChannelConfig;

  /** Prepare the channel (open a browser, restore a session, etc.). */
  init(): Promise<void>;

  /** Fetch anything new since the last poll: inbound messages and new threads. */
  poll(): Promise<InboundEvent[]>;

  /** Deliver a message to a thread addressed by its platform-native id. */
  sendMessage(externalId: string, text: string): Promise<void>;

  /** Groups-only: run the configured searches and return fresh leads. */
  searchLeads?(): Promise<GroupLead[]>;

  /** Tear down (close browser context, flush session state). */
  close(): Promise<void>;
}
