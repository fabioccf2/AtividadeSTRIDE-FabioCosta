import express, { Request, Response, NextFunction } from "express";
import { router } from "./routes";

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api", router);

/**
 * [I]nformation Disclosure — CORRIGIDO.
 * O stack trace vai apenas para o log do servidor; o cliente
 * recebe uma mensagem genérica, sem detalhes internos.
 */
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[ERRO] falha nao tratada:", err.stack ?? err.message);

  res.status(500).json({ error: "erro interno" });
});

export default app;
