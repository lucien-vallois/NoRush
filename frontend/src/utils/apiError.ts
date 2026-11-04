/**
 * Mensagem de erro da API para mostrar ao usuário. O backend já traduz os
 * erros com `code` pelo Accept-Language; erros de validação chegam como lista.
 */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { message?: unknown } } })?.response
    ?.data;
  const message = data?.message;
  if (typeof message === "string" && message.trim()) return message;
  if (Array.isArray(message) && message.length > 0) {
    return message.map(String).join(" · ");
  }
  return fallback;
}
