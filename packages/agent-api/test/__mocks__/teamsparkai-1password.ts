/** Jest stub: real resolver is not needed for agent-api unit/integration tests. */
export async function createOnePasswordClient(): Promise<Record<string, never>> {
  return {};
}

export function parseOpUri(_uri: string): { vault: string; item: string; field: string } {
  return { vault: '', item: '', field: '' };
}
