import { type AppState, validateState } from "./model";
// Images appear once on the wire even when many scheduled snapshots reuse them.
export function packState(state: AppState) {
  const images: Record<string, string> = {},
    seen = new Map<string, string>();
  const image = (value: string) => {
    if (!value) return "";
    let id = seen.get(value);
    if (!id) {
      id = String(seen.size);
      seen.set(value, id);
      images[id] = value;
    }
    return `asset:${id}`;
  };
  return {
    ...state,
    posts: state.posts.map((p) => ({ ...p, image: image(p.image) })),
    jobs: state.jobs.map((j) => ({
      ...j,
      postSnapshot: { ...j.postSnapshot, image: image(j.postSnapshot.image) },
    })),
    images,
  };
}
export function unpackState(input: unknown): AppState {
  const raw = input as ReturnType<typeof packState>;
  if (!raw || !Array.isArray(raw.posts) || !Array.isArray(raw.jobs))
    throw new Error("Backup inválido.");
  const image = (value: string) => {
    if (typeof value !== "string") throw new Error("Imagem inválida.");
    if (!value.startsWith("asset:")) return value;
    const data = raw.images?.[value.slice(6)];
    if (!data) throw new Error("Imagem não encontrada no backup.");
    return data;
  };
  return validateState({
    ...raw,
    posts: raw.posts.map((p) => ({ ...p, image: image(p.image) })),
    jobs: raw.jobs.map((j) => ({
      ...j,
      postSnapshot: { ...j.postSnapshot, image: image(j.postSnapshot.image) },
    })),
  });
}
export function payloadJSON(state: AppState) {
  const data = JSON.stringify(packState(state));
  if (new TextEncoder().encode(data).byteLength > 3_800_000)
    throw new Error(
      "O espaço atingiu 3,8 MB. Remova imagens não utilizadas ou exporte e reduza o histórico antes de continuar.",
    );
  return data;
}
