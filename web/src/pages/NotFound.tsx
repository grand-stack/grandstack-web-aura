// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { Link } from "react-router";
import { useTitle } from "../hooks";
import { EmptyState } from "../ui";

export function NotFound() {
  useTitle("Not found");
  return (
    <div className="page">
      <EmptyState title="There is nothing at this address">
        <Link to="/" className="btn btn-primary">Back to the start</Link>
      </EmptyState>
    </div>
  );
}
