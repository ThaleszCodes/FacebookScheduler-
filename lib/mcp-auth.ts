export const schedulerOrigin = "https://facebook-group-scheduler.vercel.app";
export function protectedResourceMetadata(supabaseUrl: string) {
  const url = new URL(supabaseUrl);
  if (url.protocol !== "https:") throw new Error("OAuth requires HTTPS");
  return {
    resource: `${schedulerOrigin}/mcp`,
    authorization_servers: [`${url.origin}/auth/v1`],
    bearer_methods_supported: ["header"],
    resource_name: "Facebook Scheduler",
  };
}
export function authChallenge() {
  return `Bearer resource_metadata="${schedulerOrigin}/.well-known/oauth-protected-resource/mcp"`;
}
export function safeOAuthRedirect(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("Retorno OAuth inválido.");
  return url.href;
}
