import "dotenv/config";

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { PrismaClient, Role } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { MIN_PASSWORD_LENGTH, hashPassword } from "../../lib/auth/password";

/**
 * Creates or updates a CMS account: `npm run cms:user`.
 *
 * Prompts interactively, or takes ADMIN_EMAIL and ADMIN_PASSWORD from the
 * environment so a fresh production database can be given its first operator
 * without a shell that echoes the password into history.
 */

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set.");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function ask(question: string, hidden = false): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout, terminal: true });

  if (hidden) {
    // Readline has no password mode; muting the output stream is the usual trick.
    const output = rl as unknown as { output: { write: (chunk: string) => void } };
    const write = output.output.write.bind(output.output);
    output.output.write = (chunk: string) => {
      if (!chunk.includes(question)) return;
      write(chunk);
    };
  }

  const answer = await rl.question(question);
  rl.close();

  if (hidden) {
    stdout.write("\n");
  }

  return answer.trim();
}

async function main(): Promise<void> {
  const email = (process.env.ADMIN_EMAIL ?? (await ask("Email: "))).toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? (await ask("Password: ", true));

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error(`"${email}" is not an email address.`);
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.upsert({
    where: { email },
    create: { email, passwordHash, role: Role.ADMIN, name: "Editor" },
    update: { passwordHash },
    select: { id: true, role: true },
  });

  // A changed password should end sessions opened with the old one.
  const { count } = await prisma.session.deleteMany({ where: { userId: user.id } });

  console.log(`${email} ready (${user.role}); ${count} existing session(s) signed out.`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
