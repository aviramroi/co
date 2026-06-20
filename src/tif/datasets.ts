// Representative datasets for the TIF benchmark. These mirror the kind of
// payloads an LLM actually receives from MCP servers / REST APIs (the Salesforce
// SOQL case from docs/salesforce-mcp-token-abstraction.md), where the win is
// largest: many rows, repeated keys, repeated string values.

import type { Dataset } from "./benchmark.js";
import type { Record_ } from "./types.js";

const FIRST = ["John", "Jane", "Sam", "Alex", "Maria", "Lee", "Nina", "Omar", "Ivy", "Raj"];
const INDUSTRY = ["Manufacturing", "Technology", "Healthcare", "Finance"];
const CITY = ["New York", "San Francisco", "Austin", "Seattle"];

/** Salesforce-like Account query result: repeated owner, repeated picklists. */
export function salesforceAccounts(n: number): Dataset {
  const records: Record_[] = Array.from({ length: n }, (_, i) => ({
    Id: `0015g00000XyZ${String(i).padStart(4, "0")}AAB`,
    Name: `${FIRST[i % FIRST.length]} ${["Corp", "LLC", "Inc", "Group"][i % 4]}`,
    Industry: INDUSTRY[i % INDUSTRY.length],
    BillingCity: CITY[i % CITY.length],
    AnnualRevenue: 1_000_000 * ((i % 50) + 1),
    OwnerId: "0055g00000AbCdeFAAB",
    IsActive: i % 3 !== 0,
  }));
  return { name: `Salesforce Accounts x${n}`, records };
}

/** Users with a small scalar list field (roles). */
export function usersWithRoles(n: number): Dataset {
  const roleSets = [["admin", "owner"], ["viewer"], ["editor", "viewer"], ["admin"]];
  const records: Record_[] = Array.from({ length: n }, (_, i) => ({
    user_id: i + 1,
    name: FIRST[i % FIRST.length],
    company: "Acme Inc",
    roles: roleSets[i % roleSets.length],
  }));
  return { name: `Users with roles x${n}`, records };
}

/** Wide-ish, lots of repeated strings — the dictionary's best case. */
export function repeatedStrings(n: number): Dataset {
  const records: Record_[] = Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: FIRST[i % FIRST.length],
    company: "Acme Incorporated International",
    department: ["Engineering", "Sales"][i % 2],
    status: "active",
    region: "North America",
  }));
  return { name: `Repeated strings x${n}`, records };
}

export const DATASETS: Dataset[] = [
  salesforceAccounts(50),
  usersWithRoles(50),
  repeatedStrings(50),
];
