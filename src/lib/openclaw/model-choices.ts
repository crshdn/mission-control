// Keep catalog suggestions current without rewriting saved model identifiers.
function miniMaxTextModel(model: string): string | undefined {
  const match = model.match(/^(?:minimax(?:-cn|-portal|-portal-cn)?\/|openrouter\/minimax\/|opencode\/)(minimax-(?:m1(?:-40k|-80k)?|m2(?:\.[157])?(?:-highspeed|-lightning)?|m3(?:\.1-flash(?:-preview|:free|-free)?)?|text-01))$/i);
  return match?.[1].toLowerCase();
}

function currentMiniMaxRank(model: string): number {
  switch (miniMaxTextModel(model)) {
    case 'minimax-m3.1-flash':
    case 'minimax-m3.1-flash:free':
    case 'minimax-m3.1-flash-free':
      return 0;
    case 'minimax-m3':
      return 1;
    default:
      return 2;
  }
}

export function modelChoices(models: string[], selectedModel?: string): string[] {
  // Unknown custom IDs and nontext models are not subject to text retirement.
  const choices = Array.from(new Set(models)).filter(model =>
    !miniMaxTextModel(model) || currentMiniMaxRank(model) < 2,
  );
  const current = choices.filter(model => currentMiniMaxRank(model) < 2)
    .sort((a, b) => currentMiniMaxRank(a) - currentMiniMaxRank(b));
  let index = 0;
  const ordered = choices.map(model => currentMiniMaxRank(model) < 2 ? current[index++] : model);

  // An existing selection must remain visible even after catalog retirement.
  if (selectedModel && !ordered.includes(selectedModel)) ordered.push(selectedModel);
  return ordered;
}
