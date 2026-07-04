import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { hashPassword, verifyPassword } from "./passwords.js";
import { createLogger } from "../logger.js";

const log = createLogger("auth");

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: number;
}

interface AuthData {
  users: User[];
}

/** Operator accounts, persisted to `<stateDir>/auth.json` (0600). */
export class AuthStore {
  private data: AuthData;
  private readonly file: string;

  constructor(stateDir: string) {
    const dir = resolve(process.cwd(), stateDir);
    mkdirSync(dir, { recursive: true });
    this.file = join(dir, "auth.json");
    this.data = this.read();
  }

  private read(): AuthData {
    if (!existsSync(this.file)) return { users: [] };
    try {
      return JSON.parse(readFileSync(this.file, "utf8")) as AuthData;
    } catch (err) {
      log.error(`auth.json unreadable: ${(err as Error).message}`);
      return { users: [] };
    }
  }

  private persist() {
    const tmp = `${this.file}.${randomUUID()}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    renameSync(tmp, this.file);
  }

  count(): number {
    return this.data.users.length;
  }

  getByEmail(email: string): User | undefined {
    const norm = email.trim().toLowerCase();
    return this.data.users.find((u) => u.email === norm);
  }

  getById(id: string): User | undefined {
    return this.data.users.find((u) => u.id === id);
  }

  create(email: string, password: string): User {
    const norm = email.trim().toLowerCase();
    if (this.getByEmail(norm)) throw new Error("An account with that email already exists.");
    const user: User = {
      id: randomUUID(),
      email: norm,
      passwordHash: hashPassword(password),
      createdAt: Date.now(),
    };
    this.data.users.push(user);
    this.persist();
    log.info(`Created operator account: ${norm}`);
    return user;
  }

  verify(email: string, password: string): User | null {
    const user = this.getByEmail(email);
    if (!user) {
      // Run a dummy hash to reduce timing oracle on account existence.
      verifyPassword(password, "scrypt$00$00");
      return null;
    }
    return verifyPassword(password, user.passwordHash) ? user : null;
  }
}
