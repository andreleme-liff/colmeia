// Quem pode entrar, sem depender de banco — compartilhado entre o login e o cadastro de pessoas.

/**
 * E-mails que entram como admin mesmo sem cadastro: `ADMIN_EMAIL`, um ou mais separados por
 * vírgula. É o que tira a base vazia do impasse — sem isto ninguém poderia cadastrar ninguém.
 */
export function emailsAdmin(): string[] {
  return (process.env.ADMIN_EMAIL ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

/** Formato mínimo de e-mail: é por ele que a pessoa é reconhecida no login. */
export function emailValido(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
