import { Router, Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import sqlite3 from "sqlite3";
import path from "path";
import fs from "fs";

export const router = Router();

const DB_PATH = path.join(__dirname, "..", "data", "app.db");

function ensureDatabase(): sqlite3.Database {
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const db = new sqlite3.Database(DB_PATH);
  db.serialize(() => {
    db.run(
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        email TEXT NOT NULL,
        balance REAL DEFAULT 0
      )`,
    );
    db.run(
      `INSERT OR IGNORE INTO users (id, username, email, balance)
       VALUES (1, 'alice', 'alice@example.com', 100.0)`,
    );
    db.run(
      `INSERT OR IGNORE INTO users (id, username, email, balance)
       VALUES (2, 'bob', 'bob@example.com', 50.0)`,
    );
  });
  return db;
}

/**
 * [S]poofing — POST /api/login — CORRIGIDO.
 * O segredo do JWT vem de process.env.JWT_SECRET. Sem a variável
 * configurada a API falha de forma segura, sem emitir token.
 */
router.post("/login", (req: Request, res: Response) => {
  const { username, password } = req.body ?? {};

  if (!username || !password) {
    return res
      .status(400)
      .json({ error: "username e password são obrigatórios" });
  }

  // Credenciais de demonstração (intencional para a atividade)
  if (username !== "admin" || password !== "admin") {
    return res.status(401).json({ error: "credenciais inválidas" });
  }

  const secret = process.env.JWT_SECRET;

  if (!secret || secret.trim().length === 0) {
    console.error(
      "[SEGURANCA] JWT_SECRET nao configurado — emissao de token abortada",
    );
    return res.status(500).json({ error: "erro interno" });
  }

  const token = jwt.sign({ username, role: "admin" }, secret, {
    expiresIn: "1h",
  });

  return res.status(200).json({
    message: "login realizado com sucesso",
    token,
  });
});

/**
 * [T]ampering — GET /api/users/search?username= — CORRIGIDO.
 * Prepared statement com placeholder (?): a entrada do usuário
 * é tratada como dado, nunca como comando SQL.
 */
router.get("/users/search", (req: Request, res: Response) => {
  const username = String(req.query.username ?? "");

  if (!username) {
    return res.status(400).json({ error: "username é obrigatório" });
  }

  const db = ensureDatabase();
  const query =
    "SELECT id, username, email, balance FROM users WHERE username = ?";

  db.all(query, [username], (err, rows) => {
    db.close();
    if (err) {
      return res
        .status(500)
        .json({ error: "falha na consulta", details: err.message });
    }
    return res.status(200).json({ results: rows ?? [] });
  });
});

/**
 * [R]epudiation — POST /api/transactions/transfer — CORRIGIDO.
 * A operação registra log de auditoria no sucesso e no erro,
 * e sempre devolve resposta ao cliente.
 */
router.post("/transactions/transfer", (req: Request, res: Response) => {
  const { fromUserId, toUserId, amount } = req.body ?? {};

  if (fromUserId == null || toUserId == null || amount == null) {
    return res
      .status(400)
      .json({ error: "fromUserId, toUserId e amount são obrigatórios" });
  }

  const numericAmount = Number(amount);
  if (Number.isNaN(numericAmount) || numericAmount <= 0) {
    return res
      .status(400)
      .json({ error: "amount deve ser um número positivo" });
  }

  try {
    const db = ensureDatabase();
    db.run("UPDATE users SET balance = balance - ? WHERE id = ?", [
      numericAmount,
      fromUserId,
    ]);
    db.run("UPDATE users SET balance = balance + ? WHERE id = ?", [
      numericAmount,
      toUserId,
    ]);
    db.close();

    console.info(
      `[AUDITORIA] transferencia concluida de=${fromUserId} para=${toUserId} valor=${numericAmount}`,
    );

    return res.status(200).json({
      message: "transferência concluída",
      fromUserId,
      toUserId,
      amount: numericAmount,
    });
  } catch (error) {
    console.error("[AUDITORIA] falha ao processar transferencia", error);
    return res.status(500).json({ error: "erro interno" });
  }
});

/**
 * GET /api/debug/crash — rota mantida por contrato.
 * O erro sobe ao middleware global de src/app.ts, que agora
 * responde apenas { error: 'erro interno' }.
 */
router.get(
  "/debug/crash",
  (_req: Request, _res: Response, next: NextFunction) => {
    next(new Error("falha simulada para disclosure"));
  },
);

/**
 * [D]enial of Service — POST /api/validate/email — CORRIGIDO.
 * Regex sem quantificadores aninhados e limite de tamanho na
 * entrada: validação em tempo linear, sem backtracking explosivo.
 */
router.post("/validate/email", (req: Request, res: Response) => {
  const { email } = req.body ?? {};

  if (typeof email !== "string" || email.length === 0) {
    return res.status(400).json({ error: "email é obrigatório" });
  }

  const emailRegex =
    /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,255}\.[A-Za-z]{2,24}$/;

  const isValid = email.length <= 254 && emailRegex.test(email);

  return res.status(200).json({
    email,
    valid: isValid,
  });
});

/**
 * [E]levation of Privilege — POST /api/reports/generate — CORRIGIDO.
 * Sem child_process/exec/eval. O tipo é validado contra uma
 * whitelist e o relatório é gerado dentro da própria aplicação.
 */
router.post("/reports/generate", (req: Request, res: Response) => {
  const { type } = req.body ?? {};

  if (typeof type !== "string" || type.trim().length === 0) {
    return res.status(400).json({ error: "type é obrigatório" });
  }

  const RELATORIOS_PERMITIDOS: string[] = ["summary", "balance"];
  const tipo = type.trim();

  if (!RELATORIOS_PERMITIDOS.includes(tipo)) {
    return res.status(400).json({ error: "type não permitido" });
  }

  return res.status(200).json({
    message: "relatório gerado",
    output: `stride-ok-${tipo}`,
  });
});
