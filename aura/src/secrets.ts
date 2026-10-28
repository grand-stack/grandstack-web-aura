// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import type { Driver } from "neo4j-driver";
import type { SecretBox } from "./crypto.js";

export interface AuraCredentials {
  clientId: string;
  clientSecret: string;
}

/**
 * Reads and writes secrets as nodes the GraphQL schema does not know about, over Bolt. Only ciphertext is ever stored. The
 * client id and secret are sealed together, so not even the client id is readable from the database.
 */
export class SecretStore {
  constructor(
    private readonly driver: Driver,
    private readonly database: string,
    private readonly box: SecretBox,
  ) {}

  private aad(accountId: string): string {
    return `aura-secret:${accountId}`;
  }

  private async run<T>(work: (session: ReturnType<Driver["session"]>) => Promise<T>): Promise<T> {
    const session = this.driver.session({ database: this.database });
    try {
      return await work(session);
    } finally {
      await session.close();
    }
  }

  async saveAuraSecret(accountId: string, credentials: AuraCredentials): Promise<void> {
    const sealed = this.box.seal(JSON.stringify(credentials), this.aad(accountId));
    await this.run((s) =>
      s.run(
        `MERGE (n:AuraSecret {accountId: $accountId})
         SET n.cipher = $cipher, n.nonce = $nonce, n.keyVersion = $keyVersion, n.storedAt = $storedAt`,
        { accountId, ...sealed, keyVersion: sealed.keyVersion, storedAt: new Date().toISOString() },
      ),
    );
  }

  async loadAuraSecret(accountId: string): Promise<AuraCredentials | null> {
    const records = await this.run((s) =>
      s.run(`MATCH (n:AuraSecret {accountId: $accountId}) RETURN n.cipher AS cipher, n.nonce AS nonce, n.keyVersion AS keyVersion`, { accountId }),
    );
    const row = records.records[0];
    if (!row) return null;
    const plaintext = this.box.open({ cipher: row.get("cipher"), nonce: row.get("nonce"), keyVersion: Number(row.get("keyVersion")) }, this.aad(accountId));
    return JSON.parse(plaintext) as AuraCredentials;
  }

  async hasAuraSecret(accountId: string): Promise<boolean> {
    const result = await this.run((s) => s.run(`MATCH (n:AuraSecret {accountId: $accountId}) RETURN count(n) AS n`, { accountId }));
    return Number(result.records[0]!.get("n")) > 0;
  }

  async deleteAuraSecret(accountId: string): Promise<void> {
    await this.run((s) => s.run(`MATCH (n:AuraSecret {accountId: $accountId}) DETACH DELETE n`, { accountId }));
  }

  private instanceAad(auraId: string): string {
    return `instance-credential:${auraId}`;
  }

  /**
   * Stores an instance's password, sealed, and links it to the instance if the instance is already in the store. Aura shows the
   * password only once, so this is done before anything else that could fail. The username is not secret and is kept as it is.
   */
  async saveInstanceCredential(auraId: string, username: string, password: string): Promise<void> {
    const sealed = this.box.seal(JSON.stringify({ password }), this.instanceAad(auraId));
    await this.run((s) =>
      s.run(
        `MERGE (c:InstanceCredential {instanceAuraId: $auraId})
         SET c.username = $username, c.cipher = $cipher, c.nonce = $nonce, c.keyVersion = $keyVersion, c.storedAt = $storedAt,
             c.revealCount = coalesce(c.revealCount, 0)
         WITH c
         OPTIONAL MATCH (i:Instance {auraId: $auraId})
         FOREACH (x IN CASE WHEN i IS NULL THEN [] ELSE [i] END | MERGE (x)-[:HAS_CREDENTIAL]->(c))`,
        { auraId, username, ...sealed, storedAt: new Date().toISOString() },
      ),
    );
  }

  /** Links a stored password to its instance, for a password saved before the instance had been recorded. */
  async linkInstanceCredential(auraId: string): Promise<void> {
    await this.run((s) =>
      s.run(`MATCH (i:Instance {auraId: $auraId}), (c:InstanceCredential {instanceAuraId: $auraId}) MERGE (i)-[:HAS_CREDENTIAL]->(c)`, { auraId }),
    );
  }

  /**
   * Opens an instance's password for one reveal, and records that it was shown: the count and time on the credential, and an
   * audit event of who asked. Returns null when no password is stored. The plaintext is returned to the caller only.
   */
  async revealInstanceCredential(auraId: string, by: string, at: string): Promise<{ username: string; password: string } | null> {
    const found = await this.run((s) =>
      s.run(`MATCH (c:InstanceCredential {instanceAuraId: $auraId}) RETURN c.username AS username, c.cipher AS cipher, c.nonce AS nonce, c.keyVersion AS keyVersion`, { auraId }),
    );
    const row = found.records[0];
    if (!row) return null;
    const plaintext = this.box.open({ cipher: row.get("cipher"), nonce: row.get("nonce"), keyVersion: Number(row.get("keyVersion")) }, this.instanceAad(auraId));
    // Record before returning: a reveal that is not recorded must not happen
    await this.run((s) =>
      s.run(
        `MATCH (c:InstanceCredential {instanceAuraId: $auraId})
         SET c.revealCount = coalesce(c.revealCount, 0) + 1, c.lastRevealedAt = $at
         CREATE (:AuditEvent {id: randomUUID(), kind: 'PASSWORD_REVEAL', instanceAuraId: $auraId, by: $by, at: $at})`,
        { auraId, by, at },
      ),
    );
    return { username: String(row.get("username")), password: (JSON.parse(plaintext) as { password: string }).password };
  }

  async deleteInstanceCredential(auraId: string): Promise<void> {
    await this.run((s) => s.run(`MATCH (c:InstanceCredential {instanceAuraId: $auraId}) DETACH DELETE c`, { auraId }));
  }
}
