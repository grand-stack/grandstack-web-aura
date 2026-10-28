// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { GraphQLError } from "graphql";

/** A problem the person can act on. Its message is shown to them, so it never contains a secret. */
export class UserError extends GraphQLError {
  constructor(message: string) {
    super(message, { extensions: { code: "USER_ERROR" } });
  }
}
