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
}
