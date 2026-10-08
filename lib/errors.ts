import { ZodError } from "zod";
export function humanError(error: unknown) {
  if (error instanceof ZodError) {
    const issue = error.issues[0];
    if (issue.code === "custom") return issue.message;
    const fields: Record<string, string> = {
      name: "Nome",
      title: "Título",
      text: "Texto",
      url: "Link do grupo",
      link: "Link",
      image: "Imagem",
      resultUrl: "Link da publicação",
      groupIds: "Grupos",
      postIds: "Posts",
      dailyLimit: "Limite diário",
      days: "Quantidade de dias",
    };
    const field = fields[String(issue.path.at(-1))] || "Dados";
    return `${field}: confira o valor informado e os limites do campo.`;
  }
  if (error instanceof DOMException && error.name === "QuotaExceededError")
    return "Sem espaço neste navegador. Exporte um backup e reduza as imagens.";
  return error instanceof Error
    ? error.message
    : "Não foi possível concluir. Tente novamente.";
}
