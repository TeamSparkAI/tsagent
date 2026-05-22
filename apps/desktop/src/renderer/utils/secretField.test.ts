import { isSecretFieldName, obfuscateSecretValue } from './secretField';

describe('isSecretFieldName', () => {
  it('returns false for empty or whitespace names', () => {
    expect(isSecretFieldName('')).toBe(false);
    expect(isSecretFieldName('   ')).toBe(false);
  });

  it('matches common secret env/header names', () => {
    expect(isSecretFieldName('API_KEY')).toBe(true);
    expect(isSecretFieldName('OPENAI_API_KEY')).toBe(true);
    expect(isSecretFieldName('Authorization')).toBe(true);
    expect(isSecretFieldName('authorization')).toBe(true);
    expect(isSecretFieldName('X-Api-Key')).toBe(true);
    expect(isSecretFieldName('BEARER_TOKEN')).toBe(true);
    expect(isSecretFieldName('client_secret')).toBe(true);
    expect(isSecretFieldName('PASSWORD')).toBe(true);
    expect(isSecretFieldName('AWS_SECRET_ACCESS_KEY')).toBe(true);
    expect(isSecretFieldName('auth')).toBe(true);
    expect(isSecretFieldName('X-Auth-Token')).toBe(true);
  });

  it('does not match benign names', () => {
    expect(isSecretFieldName('PATH')).toBe(false);
    expect(isSecretFieldName('HOME')).toBe(false);
    expect(isSecretFieldName('USER')).toBe(false);
    expect(isSecretFieldName('NODE_ENV')).toBe(false);
    expect(isSecretFieldName('Content-Type')).toBe(false);
  });
});

describe('obfuscateSecretValue', () => {
  it('returns empty for empty input', () => {
    expect(obfuscateSecretValue('')).toBe('');
  });

  it('replaces each character with a bullet', () => {
    expect(obfuscateSecretValue('abc')).toBe('•••');
    expect(obfuscateSecretValue('sk-12345')).toHaveLength(8);
  });
});
