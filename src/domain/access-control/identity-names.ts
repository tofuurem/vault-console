// Vault names implicitly created entities `entity_<8 hex chars>`.
const GENERATED_ENTITY_NAME = /^entity_[0-9a-f]{8}$/;

export function isGeneratedEntityName(name: string): boolean {
  return GENERATED_ENTITY_NAME.test(name);
}

/** Prefers a human-chosen entity name and falls back to the login name. */
export function identityTitle(entityName: string, username: string): string {
  return entityName && !isGeneratedEntityName(entityName) ? entityName : username;
}
