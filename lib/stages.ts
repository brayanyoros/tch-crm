/** Cor fixa de cada etapa. Etapas criadas depois usam a cor pela posição. */
const BY_ID: Record<string, string> = { novo: "--stage-novo", atendimento: "--stage-atend", proposta: "--stage-prop", negociacao: "--stage-neg", ganho: "--stage-ganho" };
const BY_POS = ["--stage-novo", "--stage-atend", "--stage-prop", "--stage-neg"];
export function stageColor(id: string, index: number, total = 5) {
  return `var(${BY_ID[id] ?? (index >= total - 1 ? "--stage-ganho" : BY_POS[Math.min(index, 3)])})`;
}
