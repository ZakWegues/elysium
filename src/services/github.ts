import { execFile } from "node:child_process";

/**
 * O GitHub do dono no briefing (25/11), só leitura, pelo `gh` que já está logado neste PC (nenhuma
 * chave passa pelo app): CI quebrado, PR e issue abertos, e versão nova dos projetos com estrela.
 */
const CONSULTA = `{viewer{
 repositories(first:8,orderBy:{field:PUSHED_AT,direction:DESC},ownerAffiliations:OWNER){nodes{name isArchived issues(states:OPEN){totalCount} pullRequests(states:OPEN){totalCount} defaultBranchRef{target{... on Commit{statusCheckRollup{state}}}}}}
 starredRepositories(first:60,orderBy:{field:STARRED_AT,direction:DESC}){nodes{nameWithOwner latestRelease{tagName publishedAt isPrerelease}}}}}`;

export interface RepoMeu { nome: string; issues: number; prs: number; ci: string | null }
export interface VersaoNova { repo: string; versao: string; em: number }
export interface ResumoGithub { meus: RepoMeu[]; versoes: VersaoNova[] }

type Cru = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
/** Pura. */
export function lerGithub(j: Cru, agora = Date.now()): ResumoGithub {
  const v = j?.data?.viewer ?? {};
  const meus = ((v.repositories?.nodes ?? []) as Cru[]).filter((r) => r?.name && !r.isArchived).map((r) => ({
    nome: String(r.name).slice(0, 60), issues: Number(r.issues?.totalCount) || 0, prs: Number(r.pullRequests?.totalCount) || 0,
    ci: typeof r.defaultBranchRef?.target?.statusCheckRollup?.state === "string" ? r.defaultBranchRef.target.statusCheckRollup.state : null,
  }));
  const versoes = ((v.starredRepositories?.nodes ?? []) as Cru[]).map((r) => ({ repo: String(r?.nameWithOwner ?? "").slice(0, 80), versao: String(r?.latestRelease?.tagName ?? "").slice(0, 40), em: Date.parse(r?.latestRelease?.publishedAt ?? ""), pre: r?.latestRelease?.isPrerelease === true }))
    .filter((r) => r.repo && r.versao && !r.pre && agora - r.em < 3 * 86_400_000).sort((a, b) => b.em - a.em).map(({ repo, versao, em }) => ({ repo, versao, em }));
  return { meus, versoes };
}

/** Pura. */
export function topicosDoGithub(g: ResumoGithub): string[] {
  const t: string[] = [];
  const quebrados = g.meus.filter((r) => r.ci === "FAILURE" || r.ci === "ERROR").map((r) => r.nome);
  if (quebrados.length) t.push(`CI falhando em ${quebrados.slice(0, 3).join(", ")}`);
  const prs = g.meus.reduce((s, r) => s + r.prs, 0), issues = g.meus.reduce((s, r) => s + r.issues, 0);
  if (prs || issues) t.push([prs ? `${prs} ${prs === 1 ? "PR aberto" : "PRs abertos"}` : "", issues ? `${issues} ${issues === 1 ? "issue aberta" : "issues abertas"}` : ""].filter(Boolean).join(" e "));
  if (g.versoes.length) t.push(`Versão nova: ${g.versoes.slice(0, 3).map((x) => `${x.repo.split("/")[1]} ${x.versao}`).join(", ")}`);
  if (!t.length && g.meus.length) t.push("Tudo verde nos seus repositórios");
  return t;
}

function gh(args: string[], prazo = 15_000): Promise<string | null> {
  return new Promise((r) => execFile("gh", args, { timeout: prazo, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, out) => { if (err) console.warn("[github]", err.killed ? "demorou demais" : err.message.slice(0, 120)); r(err ? null : String(out)); }));
}
export async function resumoDoGithub(): Promise<ResumoGithub | null> {
  const out = await gh(["api", "graphql", "-f", `query=${CONSULTA}`], 45_000);
  try { return out ? lerGithub(JSON.parse(out)) : null; } catch { return null; }
}
/** O estado do CI de um repositório dele ("SUCCESS", "FAILURE", "PENDING"…); null = sem esse repositório ou sem CI. Lança se o GitHub não respondeu. */
export async function estadoDoCi(repo: string): Promise<string | null> {
  const r = await resumoDoGithub();
  if (!r) throw new Error("GitHub sem resposta");
  return r.meus.find((x) => x.nome.toLowerCase() === repo.toLowerCase())?.ci ?? null;
}
